
//var SPLIT = /^(.*yEnc)\s*(\(\d\/\d\))$/;
var SPLIT = /^(.*yEnc)\s*(\((\d+)\/(\d+)\))\s*$/;

var NOZERO = /([^0]\d*)$/;

function Binary(name){
	this.name = name;
	this.parts=[];
}
Binary.prototype.sort = function(){
	this.parts.sort(function(a,b){return a.num-b.num;}); // Ascending sort by num
}
function Groups(){
	this.binaries=[];
	this.binaries_index={};
}
Groups.prototype.add = function(obj){
	//console.log(obj.subject.match(SPLIT),''+obj.subject);
	//return;
	var s = obj.subject.match(SPLIT);
	if(!s)return;
	var name=s[1],part=s[2],num=parseInt(s[3].match(NOZERO)[1]),total=parseInt(s[4].match(NOZERO)[1]);
	if(!this.binaries_index[name])
		this.binaries.push(this.binaries_index[name]=new Binary(name));
	obj.subject=part;
	obj.num=num;
	obj.total=total;
	this.binaries_index[name].parts.push(obj);
};

module.exports = Groups;
