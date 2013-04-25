
var fs = require('fs');
var events = require('events');

var YBEGIN = new Buffer('=ybegin ');
var YPART = new Buffer('=ypart ');
var YEND = new Buffer('=yend ');

var YVARS = /(name=.+|\w+=\S+)/g;
var YVAR = /^(\w+)=(.+)$/;

var Inverse42 = 214; // -42 mod 256
//var Inverse64 = 192; // -64 mod 256
var Inverse42_64 = 150; // -64-42 mod 256

function equals(a,b){
	if(a.length!=b.length)return;
	var n=a.length;
	for(var i=0;i<n;++i)
		if(a[i]!=b[i])return;
	return true;
}
function equalsBegin(a,b){
	if(a.length>b.length)return;
	var n=a.length;
	for(var i=0;i<n;++i)
		if(a[i]!=b[i])return;
	return true;
}

function hasNull(line){
	var i=0,n=line.length;
	for(;i<n;++i)
		if(line[i]==0)return true;
	return;
}

function yhead(line){
	if(equalsBegin(YBEGIN,line)){
		var res={};
		line.slice(YBEGIN.length).toString().match(YVARS).forEach(function(it){
			var pair = it.match(YVAR);
			res[pair[1]]=pair[2];
		});
		return res;
	}
}
function ypart(line){
	if(equalsBegin(YPART,line)){
		var res={};
		line.slice(YPART.length).toString().match(YVARS).forEach(function(it){
			var pair = it.match(YVAR);
			res[pair[1]]=pair[2];
		});
		return res;
	}
}
function yend(line){
	if(equalsBegin(YEND,line)){
		var res={};
		line.slice(YEND.length).toString().match(YVARS).forEach(function(it){
			var pair = it.match(YVAR);
			res[pair[1]]=pair[2];
		});
		return res;
	}
}
function invalidLine(line){return(line[0]==0x3d&&line[1]==0x79);}

function dotLineBeginClean(buf){
	if(buf[0]==0x2e&&buf[1]==0x2e)
		return buf.slice(1);
	return buf;
}

function yLineDecode(input,output){
	var i=0,j=0;n=input.length;
	while(i<n){
		if(input[i]==0x3d){
			++i;
			output[j]=(input[i]+Inverse42_64)&0xff;
		}else{
			output[j]=(input[i]+Inverse42)&0xff;
		}
		++i;
		++j;
	}
	return j;
}

function decodeBody(data,stream,remDotLines){
	var ev = new events.EventEmitter();
	var state=0;
	var count = 0;
	var size1 = -1,size2 = -1;
	var head;
	var part;
	var end;
	data.on('line',function(line){
		if(hasNull(line))return;
		switch(state){
		case 0:
			head = yhead(line);
			if(!head)return;
			state=head.part?1:2;
			ev.emit('info1',head);
			break;
		case 1:
			part = ypart(line);
			if(part){
				size1 = (parseInt(part.end)-(parseInt(part.begin)-1))
				ev.emit('info2',part);
				state=2;
				break;
			}else{
				ev.emit('warn','missing \'=ypart\' line');
			}
		case 2:
			end = yend(line);
			if(end){
				state=3;
				ev.emit('end',end,count);
			}else{
				if(invalidLine(line)){
					break;
					state=3;
				}
				if(remDotLines)
					line = dotLineBeginClean(line);
				var buf = new Buffer(line.length);
				var l = yLineDecode(line,buf);
				count+=l;
				stream.write(buf.slice(0,l));
			}
			break;
		}
	});
	data.on('end',function(line){
		ev.emit('termitnate');
	});
	return ev;
}


/*
module.exports.yhead = yhead;
module.exports.ypart = ypart;
module.exports.yend = yend;
module.exports.yLineDecode = yLineDecode;
//*/
module.exports.decodeBody = decodeBody;


