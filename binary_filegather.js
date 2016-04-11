/*
Copyright (C) Simon Schmidt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
*/
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
