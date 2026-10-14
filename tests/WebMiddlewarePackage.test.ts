import { test } from "bun:test";
import { native } from "./helpers/webPackages";
test("optional forms decode and reject invalid encodings", () => {
  native(`import [Form] from "bpl-web-middleware";
    import [Option] from "std/option.bpl";
    extern strlen(s:string) ret long;extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local body:string="title=a%26b+z&flag&title=last";local form:Form=Form.parse(body,strlen(body));
      if(strcmp(form.get("title").unwrap(),"last")!=0 || strcmp(form.get("flag").unwrap(),"")!=0){return 6;}form.destroy();
      local caught:bool=false;try{local bad:Form=Form.parse("x=%00",5);bad.destroy();}catch{caught=true;}if(!caught){return 7;}return 0;
    }`);
}, 90000);

test("optional middleware preserves Vary, handles preflights and enforces JSON media types", () => {
  native(`
    import [App],[Request],[Response] from "bpl-express";
    import cors,securityHeaders,requireJson from "bpl-web-middleware";
    extern socketpair(domain:int,kind:int,protocol:int,fds:*int) ret int;
    extern read(fd:int,buf:string,size:ulong) ret long;extern close(fd:int) ret int;extern strstr(a:string,b:string) ret string;
    frame main() ret int {
      local app:App=App.new();local fds:int[2];if(socketpair(1,1,0,&fds[0])!=0){return 1;}
      local req:Request=app.parseRequest("OPTIONS /api HTTP/1.1\\r\\nHost: localhost\\r\\nOrigin: https://frontend.example\\r\\n\\r\\n");
      local res:Response=Response.new(fds[0]);res.setHeader("Vary","Accept-Encoding");securityHeaders(&req,&res);cors(&req,&res,"https://frontend.example");
      if(res.status_code!=204||!res.body_sent){return 2;}close(fds[0]);
      local bytes:char[4096];local size:long=read(fds[1],cast<string>(&bytes[0]),4095);bytes[size]=0;close(fds[1]);
      if(strstr(cast<string>(&bytes[0]),"Vary: Accept-Encoding, Origin")==nullptr||strstr(cast<string>(&bytes[0]),"Access-Control-Allow-Origin: https://frontend.example")==nullptr){return 3;}
      res.destroy();req.destroy();
      req=app.parseRequest("POST /api HTTP/1.1\\r\\nHost: localhost\\r\\nContent-Type: APPLICATION/JSON; charset=utf-8\\r\\n\\r\\n");res=Response.new(-1);requireJson(&req,&res);
      if(res.body_sent){return 4;}res.destroy();req.destroy();
      req=app.parseRequest("POST /api HTTP/1.1\\r\\nHost: localhost\\r\\nContent-Type: application/jsonp\\r\\n\\r\\n");res=Response.new(-1);requireJson(&req,&res);
      if(res.status_code!=415||!res.body_sent){return 5;}res.destroy();req.destroy();app.destroy();return 0;
    }
  `);
}, 90000);
