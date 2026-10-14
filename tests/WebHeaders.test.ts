import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("shared headers preserve repeated values, cookie lines, case-insensitive access and owned inputs", () => {
  native(String.raw`
import [HttpHeaders], [HttpParser], [ParsedRequest] from "bpl-http-parser";
import [HttpResponse] from "bpl-http-client";
import [Request], [Response] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
extern strlen(text:string)ret long;
extern socketpair(domain:int,kind:int,protocol:int,fds:*int)ret int;
extern read(fd:int,buf:string,size:ulong)ret long;
extern close(fd:int)ret int;
extern strstr(a:string,b:string)ret string;
frame main()ret int{
 local h:HttpHeaders=HttpHeaders.new();h.append("Accept","text/html");h.append("accept","application/json");
 if(strcmp(h.get("ACCEPT").unwrap(),"text/html, application/json")!=0){return 1;}
 local all:Array<string>=h.getAll("accept");if(all.len()!=2||strcmp(all.get(1),"application/json")!=0){return 2;}all.destroy();
 h.set("Accept",h.get("accept").unwrap());all=h.getAll("ACCEPT");if(all.len()!=1){return 3;}all.destroy();
 h.append("Set-Cookie","a=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT");h.append("set-cookie","b=2");
 all=h.getAll("SET-COOKIE");if(all.len()!=2||strcmp(h.get("set-cookie").unwrap(),all.get(0))!=0){return 4;}all.destroy();
 h.remove("accept");if(h.has("Accept")){return 5;}h.destroy();h.destroy();
 local raw:string="GET / HTTP/1.1\r\nHost: localhost\r\nAccept: text/html\r\naccept: application/json\r\n\r\n";
 local p:ParsedRequest=HttpParser.parseBytes(raw,strlen(raw));if(!p.valid||strcmp(p.headers.get("Accept").unwrap(),"text/html, application/json")!=0){return 6;}p.destroy();
 raw="HTTP/1.1 200 OK\r\nContent-Length: 0\r\nSet-Cookie: a=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT\r\nSet-Cookie: b=2\r\n\r\n";
 local client:*HttpResponse=HttpResponse.parseBytes(raw,strlen(raw),false);all=client.headers.getAll("set-cookie");if(client.status!=200||all.len()!=2||strcmp(all.get(1),"b=2")!=0){return 7;}all.destroy();client.destroy();
 local fds:int[2];if(socketpair(1,1,0,&fds[0])!=0){return 8;}
 local res:Response=Response.new(fds[0]);res.appendHeader("Set-Cookie","a=1").appendHeader("Set-Cookie","b=2").end();close(fds[0]);
 local bytes:char[4096];local count:long=read(fds[1],cast<string>(&bytes[0]),4095);close(fds[1]);bytes[count]=0;
 if(strstr(cast<string>(&bytes[0]),"Set-Cookie: a=1\r\nSet-Cookie: b=2\r\n")==nullptr){return 9;}
 local caught:bool=false;try{res.appendHeader("X-Test","late");}catch{caught=true;}if(!caught){return 10;}res.destroy();return 0;
}`);
}, 90000);

test("configured CORS validates requested methods and headers and supports explicit credentialed origins", () => {
  native(String.raw`
import [Cors] from "bpl-web-middleware";
import [App], [Request], [Response] from "bpl-express";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 local app:App=App.new();local policy:Cors=Cors.new("https://front.example");policy.credentials=true;policy.allowOrigin("https://other.example");policy.allowHeader("X-Trace");policy.exposeHeader("X-Request-ID");
 local req:Request=app.parseRequest("OPTIONS / HTTP/1.1\r\nHost: app.example\r\nOrigin: https://other.example\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: Content-Type, X-CSRF-Token, x-trace\r\n\r\n");
 local res:Response=Response.new(-1);policy.apply(&req,&res);
 if(res.status_code!=204||strcmp(res.headers.get("Access-Control-Allow-Credentials").unwrap(),"true")!=0||strcmp(res.headers.get("access-control-allow-origin").unwrap(),"https://other.example")!=0){return 1;}req.destroy();res.destroy();
 req=app.parseRequest("OPTIONS / HTTP/1.1\r\nHost: app.example\r\nOrigin: https://front.example\r\nAccess-Control-Request-Method: TRACE\r\n\r\n");res=Response.new(-1);policy.apply(&req,&res);if(res.status_code!=403||res.headers.has("access-control-allow-origin")){return 2;}req.destroy();res.destroy();
 req=app.parseRequest("OPTIONS / HTTP/1.1\r\nHost: app.example\r\nOrigin: https://front.example\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: X-Not-Allowed\r\n\r\n");res=Response.new(-1);policy.apply(&req,&res);if(res.status_code!=403){return 3;}req.destroy();res.destroy();
 req=app.parseRequest("GET / HTTP/1.1\r\nHost: app.example\r\nOrigin: https://front.example\r\n\r\n");res=Response.new(-1);policy.apply(&req,&res);if(res.body_sent||strcmp(res.headers.get("Access-Control-Expose-Headers").unwrap(),"x-request-id")!=0){return 4;}req.destroy();res.destroy();
 local caught:bool=false;try{policy.allowOrigin("*");}catch{caught=true;}if(!caught){return 5;}
 policy.destroy();app.destroy();return 0;
}`);
}, 90000);

test("header values preserve UTF-8 octets while rejecting control bytes", () => {
  native(String.raw`
import [HttpHeaders], [HttpParser], [ParsedRequest] from "bpl-http-parser";
import [HttpResponse] from "bpl-http-client";
import [Response] from "bpl-express";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
extern strlen(text:string)ret long;
frame main()ret int{
 local headers:HttpHeaders=HttpHeaders.new();headers.set("X-Name","café");if(strcmp(headers.get("x-name").unwrap(),"café")!=0){return 1;}headers.destroy();
 local raw:string="GET / HTTP/1.1\r\nHost: example\r\nX-Name: café\r\n\r\n";
 local req:ParsedRequest=HttpParser.parseBytes(raw,strlen(raw));if(!req.valid||strcmp(req.headers.get("x-name").unwrap(),"café")!=0){return 2;}req.destroy();
 raw="HTTP/1.1 200 OK\r\nContent-Length: 0\r\nX-Name: café\r\n\r\n";local response:*HttpResponse=HttpResponse.parseBytes(raw,strlen(raw),false);if(response.status!=200||strcmp(response.headers.get("x-name").unwrap(),"café")!=0){return 3;}response.destroy();
 local server:Response=Response.new(-1);server.setHeader("X-Name","café");local caught:bool=false;try{server.setHeader("X-Test","a\r\nb: c");}catch{caught=true;}if(!caught){return 4;}server.destroy();return 0;
}`);
}, 90000);
