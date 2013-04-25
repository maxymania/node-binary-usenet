
var net = require('net');
var tls = require('tls');
var events = require('events');
var StreamSearch = require('./sbmh.js');

var RE_LINE = /^(\d+)\s+(.+)$/;
//var RE_LINE_GROUP = /^(\d+)\s+(\d+)\s+(\d+)\s/;
var RE_GROUP = /^(\d+)\s+(\d+)\s(\d+)\s/;
var RE_HDR = /^([^:]+):[ \t]?(.+)?$/;

var CRLF = new Buffer([13,10]); // CRLF

var TERM = new Buffer([13, 10, 46, 13, 10]); // CRLF.CRLF

//var RES_CODE_ML = [100, 101, 215, 220, 221, 222, 224, 225, 230, 231];
var RES_CODE_ML = [100, 101, 211, 215, 220, 221, 222, 224, 225, 230, 231];
var RES_CODE_ARGS = [111, 211, 220, 221, 222, 223, 401];
var ERRORS = {
      400: 'Service not available or no longer available',
      401: 'Server is in the wrong mode',
      403: 'Internal fault',
      411: 'No such newsgroup',
      412: 'No newsgroup selected',
      420: 'Current article number is invalid',
      421: 'No next article in this group',
      422: 'No previous article in this group',
      423: 'No article with that number or in that range',
      430: 'No article with that message-id',
      435: 'Article not wanted',
      436: 'Transfer not possible or failed; try again later',
      437: 'Transfer rejected; do not retry',
      440: 'Posting not permitted',
      441: 'Posting failed',
      480: 'Authentication required',
      481: 'Authentication failed/rejected', // RFC 4643
      483: 'Command unavailable until suitable privacy has been arranged',
      500: 'Unknown command',
      501: 'Syntax error',
      502: 'Service/command not permitted',
      503: 'Feature not supported',
      504: 'Invalid base64-encoded argument'
};

function AppendingBuffer(size){
	this.inner = new Buffer(size);
	this.pos=0;
	this.size=size;
};
AppendingBuffer.prototype.getme = function(){
	return this.inner.slice(0,this.pos);
};
AppendingBuffer.prototype.reset = function(){
	this.pos=0;
};
AppendingBuffer.prototype.add = function(data){
	if((this.pos+data.length)>this.size) return true; //overflow
	data.copy(this.inner,this.pos);
	this.pos+=data.length;
};

function parseGroupResponse(code,resp){
	if(code!=211)return;
	var match = resp.match(RE_GROUP);
	if(!match)return;
	return {
		number:parseInt(match[1]),
		low:parseInt(match[2]),
		high:parseInt(match[3]),
	};
}
function range(begin,end){
	return ''+begin+'-'+end;
}

function overfmtHeader(cb){
	var i=0;
	var res = {
		subject:0,
		id:0,
		from:0,
		date:0
	};
	return function(err,code,resp,data){
		if(err)return cb(err);
		if(data){
			data.on('line',function(line){
				i++;
				switch(line.toString().toLowerCase().replace(/\:(full$)?/g,'')){
					case 'subject':res.subject=i; break;
					case 'message-id':res.id=i; break;
					case 'from':res.from=i; break;
					case 'date':res.date=i; break;
				}
			});
			data.on('end',function(line){ cb(null,res); });
		}else cb(new Error('no data response:'+resp));
	};
}
function overLineToObject(hdr,line,cs){
	var s = line.toString(cs).split(/\t/g);
	return {
		subject:hdr.subject?s[hdr.subject]:'',
		id:hdr.id?s[hdr.id]:null,
		idx:s[0],
		from:hdr.from?s[hdr.from]:'',
		date:hdr.date?s[hdr.date]:''
	};
}

function UsenetClient(net_options,nntp_options){
	var me = this;
	var ev = this.ev = new events.EventEmitter();
	nntp_options = nntp_options||{};
	if(nntp_options.tls)
		this.conn = tls.connect(net_options);
	else
		this.conn = net.connect(net_options);
	this.conn.on('data',function(data){ me._handleData(data); });
	this.conn.on('close',function(){ ev.emit('close'); });
	this.conn.on('error',function(err){ ev.emit('error',err); });
	//this.options = nntp_options||{};
	this.split = new StreamSearch(CRLF);
	this.split.on('info',function(isMatch, data, start, end){me._handleSplitInfo(isMatch, data, start, end);});
	this.buffer = new AppendingBuffer(512);
	this._barfd=false;
	this.multiline = null;
	this.cb = null;
	this.state = 'busy';
	this.queue = [];
	this.queue.push({cmd:'MODE READER\r\n'});
	this.forcesl=false;
	if(nntp_options.user)this.queue.push({cmd:'AUTHINFO USER '+nntp_options.user+'\r\n'});
	if(nntp_options.pass)this.queue.push({cmd:'AUTHINFO PASS '+nntp_options.pass+'\r\n'});
}
UsenetClient.prototype.on = function(e,cb){ this.ev.on(e,cb); };
UsenetClient.prototype._barf = function(reason){
	this._barfd=true;
	var err = new Error('barf '+reason);
	if(this.multiline) this.multiline.emit('error',err);
	this.ev.emit('error',err);
	this.conn.destroy();
};
UsenetClient.prototype._handleData = function(data){
	this.split.push(data);
};
UsenetClient.prototype._handleSplitInfo = function(isMatch, data, start, end){
	if(this._barfd)return;
	if(data)
		if(this.buffer.add(data.slice(start,end))) return this._barf('buffer overflow');
	if(isMatch){
		var me = this.buffer.getme();
		this.buffer.reset();
		this._handleLine(me);
	}
};
UsenetClient.prototype._pullNextCommand = function(){
	if(!this.queue.length) {
		if(this.state=='idle')return;
		this.state='idle';
		this.ev.emit('drain');
		return;
	}
	if(this.queue[0].forcesl)this.forcesl=true;
	if(this.queue[0].cmd){
		this.conn.write(this.queue[0].cmd);
		this.cb=this.queue[0].cb;
		if(this.queue[0].more)
			this.queue[0].cmd=false;
		else
			this.queue.shift();
		return;
	}
	this.conn.write(this.queue[0].more);
	this.queue.shift();
};
UsenetClient.prototype._handleLine = function(data){
	if(this.multiline){
		if(data.length==1&&data[0]==46){
			this.multiline.emit('end');
			this.multiline=null;
			this._pullNextCommand();
			return;
		}
		this.multiline.emit('line',data);
		return;
	}
	var response = data.toString().match(RE_LINE);
	if(!response) return this._barf("Response format error");
	var respc = parseInt(response[1]);
	var err=null;
	var ev=null;
	if(this.forcesl)
		this.forcesl=false;
	else if((RES_CODE_ML.indexOf(respc) > -1))
		this.multiline = ev = new events.EventEmitter();
	if(ERRORS[respc]) err = new Error(''+respc+' '+ERRORS[respc]);
	if(this.cb) {
		this.cb(err,respc,response[2],ev);
		this.cb=undefined;
	}
	//console.log(''+data);
	if(!ev)this._pullNextCommand();// do not continue on multiline!
};
UsenetClient.prototype._pushCmd = function(cmd){
	this.queue.push(cmd);
	if(this.state=='idle'){
		this.state='busy';
		this._pullNextCommand();
	}
};
UsenetClient.prototype._unshiftCmd = function(cmd){
	this.queue.unshift(cmd);
	if(this.state=='idle'){
		this.state='busy';
		this._pullNextCommand();
	}
};
UsenetClient.prototype.quit = function(group,cb){
	this._pushCmd({cmd: 'QUIT\r\n'});
};
UsenetClient.prototype.group = function(group,cb){
	this._pushCmd({
		cmd: 'GROUP '+group+'\r\n',
		forcesl:true,
		cb:cb
	});
};
UsenetClient.prototype.listgroup = function(group,cb){
	this._pushCmd({
		cmd: group?'LISTGROUP '+group+'\r\n':'LISTGROUP\r\n',
		cb:cb
	});
};
UsenetClient.prototype.over = function(range,cb){
	this._pushCmd({
		cmd: 'OVER '+range+'\r\n',//or XOVER
		cb:cb
	});
};
UsenetClient.prototype.xover = function(range,cb){
	this._pushCmd({
		cmd: 'XOVER '+range+'\r\n',//or OVER
		cb:cb
	});
};
UsenetClient.prototype._xover_unshift = function(range,cb){
	this._unshiftCmd({
		cmd: 'XOVER '+range+'\r\n',//or OVER
		cb:cb
	});
};
UsenetClient.prototype.overWithFb = function(range,cb){
	var me = this;
	function tried(err,code,resp,data){
		if(err)return me._xover_unshift(range,cb);
		cb(err,code,resp,data);
	};
	me.over(range,tried);
};
UsenetClient.prototype.overviewfmt = function(cb){
	this._pushCmd({
		cmd: 'LIST OVERVIEW.FMT\r\n',
		cb:cb
	});
};
UsenetClient.prototype.newsgroups = function(wildmat,cb){
	this._pushCmd({
		cmd: wildmat?'LIST NEWSGROUPS '+wildmat+'\r\n':'LIST NEWSGROUPS\r\n',
		cb:cb
	});
};
UsenetClient.prototype.article = function(id,cb){
	this._pushCmd({
		cmd: 'ARTICLE '+id+'\r\n',
		cb:cb
	});
};
UsenetClient.prototype.head = function(id,cb){
	this._pushCmd({
		cmd: 'HEAD '+id+'\r\n',
		cb:cb
	});
};
UsenetClient.prototype.body = function(id,cb){
	this._pushCmd({
		cmd: 'BODY '+id+'\r\n',
		cb:cb
	});
};

module.exports.UsenetClient = UsenetClient;
module.exports.parseGroupResponse = parseGroupResponse;
module.exports.range = range;
module.exports.overfmtHeader = overfmtHeader;
module.exports.overLineToObject = overLineToObject;
