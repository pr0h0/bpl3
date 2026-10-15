import { test } from "bun:test";
import { native } from "./helpers/webPackages";
test("media and encoding negotiation honors quality, specificity, parameters and identity exclusions", () => {
  native(String.raw`
import [Negotiation] from "bpl-web-middleware";
import [App], [Request], [Response] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 if(Negotiation.quality("text/*;q=0.9, text/html;q=0", "text/html",true)!=0){return 1;}
 if(Negotiation.quality("TEXT/*;q=0.5", "text/html",true)!=500){return 2;}
 if(Negotiation.quality("application/json;profile=one;q=0.7", "application/json",true)!=0){return 3;}
 if(Negotiation.quality("application/json;profile=one;q=0.7", "application/json;profile=one",true)!=700){return 4;}
 if(Negotiation.quality("gzip;q=0, *;q=1", "gzip",false)!=0){return 5;}
 if(Negotiation.quality("gzip;q=1.001", "gzip",false)!=0){return 6;}
 local app:App=App.new();local req:Request=app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\nAccept: text/html;q=0.3, application/json;q=0.8\r\nAccept-Encoding: gzip;q=0.5, identity;q=0\r\n\r\n");
 local offers:Array<string>=Array<string>.new(2);offers.push("text/html");offers.push("application/json");if(strcmp(Negotiation.best(&req,&offers).unwrap(),"application/json")!=0){return 7;}
 if(Negotiation.encoding(&req,"gzip")!=500||Negotiation.encoding(&req,"identity")!=0){return 8;}
 local res:Response=Response.new(-1);if(Negotiation.require(&req,&res,"image/png")||res.status_code!=406){return 9;}res.destroy();offers.destroy();req.destroy();
 req=app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\nAccept-Encoding: *;q=0\r\n\r\n");if(Negotiation.encoding(&req,"identity")!=0||Negotiation.encoding(&req,"gzip")!=0){return 10;}req.destroy();
 req=app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\nAccept-Encoding: gzip\r\n\r\n");if(Negotiation.encoding(&req,"identity")!=1000){return 11;}req.destroy();app.destroy();return 0;
}`);
}, 90000);

test("media parameters cannot make an unrelated media range match", () => {
  native(String.raw`
import [Negotiation] from "bpl-web-middleware";
import [App], [Request] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 if(Negotiation.quality("text/plain;profile=one", "application/json;profile=one",true)!=0){return 1;}
 if(Negotiation.quality("text/*;profile=one", "application/json;profile=one",true)!=0){return 2;}
 if(Negotiation.quality("text/plain;profile=one;charset=utf-8", "text/html;profile=one;charset=utf-8",true)!=0){return 3;}
 if(Negotiation.quality("text/plain;profile=one, application/json;q=0.2", "application/json;profile=one",true)!=200){return 4;}
 if(Negotiation.quality("application/*;profile=one;q=0.4", "application/json;profile=one",true)!=400){return 5;}
 local app:App=App.new();local req:Request=app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\nAccept: text/plain;profile=one, text/html;q=0.5\r\n\r\n");
 local offers:Array<string>=Array<string>.new(2);offers.push("application/json;profile=one");offers.push("text/html");
 if(Negotiation.accepts(&req,"application/json;profile=one")){return 6;}
 if(strcmp(Negotiation.best(&req,&offers).unwrap(),"text/html")!=0){return 7;}
 offers.destroy();req.destroy();app.destroy();return 0;
}`);
}, 90000);

test("media parameter matching decodes quoted strings and escaped delimiters", () => {
  native(String.raw`
import [Negotiation] from "bpl-web-middleware";
frame main()ret int{
 if(Negotiation.quality("text/html;charset=\"utf-8\"", "text/html;charset=UTF-8",true)!=1000){return 1;}
 if(Negotiation.quality("text/html;charset=UTF-8", "text/html;charset=\"utf-8\"",true)!=1000){return 2;}
 if(Negotiation.quality("application/json;profile=\"one\";q=0.4", "application/json;profile=one",true)!=400){return 3;}
 if(Negotiation.quality("application/json;profile=\"One\"", "application/json;profile=one",true)!=0){return 4;}
 if(Negotiation.quality("application/json;profile=\"a\\\";b\";q=0.4, text/html;q=0.8", "application/json;profile=\"a\\\";b\"",true)!=400){return 5;}
 if(Negotiation.quality("application/json;profile=\"a\\;b\"", "application/json;profile=\"a;b\"",true)!=1000){return 6;}
 if(Negotiation.quality("application/json;profile=\"a,b\";q=0.3, */*;q=0.9", "application/json;profile=\"a,b\"",true)!=300){return 7;}
 if(Negotiation.quality("application/json;profile=\"\"", "application/json;profile=\"\"",true)!=1000){return 8;}
 if(Negotiation.quality("application/json;profile=\"bad", "application/json;profile=\"bad",true)!=0){return 9;}
 if(Negotiation.quality("application/json;profile=\"one\"x", "application/json;profile=\"one\"x",true)!=0){return 10;}
 if(Negotiation.quality("application/json;profile=\"a\nb\"", "application/json;profile=\"a\nb\"",true)!=0){return 11;}
 if(Negotiation.quality("application/json;profile=bad value", "application/json;profile=bad value",true)!=0){return 12;}
 if(Negotiation.quality("application/json;profile=\"a\tb\"", "application/json;profile=\"a\tb\"",true)!=1000){return 13;}
 return 0;
}`);
}, 90000);
