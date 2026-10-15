import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("representations implement conditional precedence, byte ranges and HEAD without leaking bodies", () => {
  native(String.raw`
import [Representation], [HttpDate], [ByteRange], [App], [Request], [Response] from "bpl-express";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";
extern strcmp(a:string,b:string)ret int;
frame check(app:*App,raw:string,status:int,length:string)ret bool{
 local req:Request=app.parseRequest(raw);local res:Response=Response.new(-1);
 Representation.send(&req,&res,"0123456789",10,"\"v1\"",1445412480);
 local ok:bool=res.status_code==status;if(length!=nullptr){ok=ok&&res.headers.has("Content-Range")&&strcmp(res.headers.get("Content-Range").unwrap(),length)==0;}
 req.destroy();res.destroy();return ok;
}
frame main()ret int{
 local app:App=App.new();local date:String=HttpDate.format(1445412480);if(strcmp(date.data,"Wed, 21 Oct 2015 07:28:00 GMT")!=0){return 1;}if(!HttpDate.parse(date.data).isSome()||HttpDate.parse(date.data).unwrap()!=1445412480){return 2;}date.destroy();
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=2-4\r\n\r\n",206,"bytes 2-4/10")){return 3;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=-3\r\n\r\n",206,"bytes 7-9/10")){return 4;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=20-\r\n\r\n",416,"bytes */10")){return 5;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nIf-None-Match: W/\"v1\"\r\nRange: bytes=2-4\r\n\r\n",304,nullptr)){return 6;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nIf-Match: W/\"v1\"\r\nIf-None-Match: \"v1\"\r\n\r\n",412,nullptr)){return 7;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nIf-Modified-Since: Wed, 21 Oct 2015 07:28:00 GMT\r\n\r\n",304,nullptr)){return 8;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nIf-None-Match: \"other\"\r\nIf-Modified-Since: Wed, 21 Oct 2015 07:28:00 GMT\r\n\r\n",200,nullptr)){return 9;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=0-1\r\nIf-Range: \"other\"\r\n\r\n",200,nullptr)){return 10;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=0-1\r\nIf-Range: \"v1\"\r\n\r\n",206,"bytes 0-1/10")){return 11;}
 if(!check(&app,"HEAD / HTTP/1.1\r\nHost: x\r\nRange: bytes=0-1\r\n\r\n",200,nullptr)){return 12;}
 if(!check(&app,"GET / HTTP/1.1\r\nHost: x\r\nRange: bytes=0-1,4-5\r\n\r\n",200,nullptr)){return 13;}
 local part:ByteRange=Representation.range("bytes=92233720368547758080-",10);if(part.valid){return 14;}
 if(!HttpDate.parse("Wednesday, 21-Oct-15 07:28:00 GMT").isSome()||HttpDate.parse("Wednesday, 21-Oct-15 07:28:00 GMT").unwrap()!=1445412480){return 15;}
 if(!HttpDate.parse("Wed Oct 21 07:28:00 2015").isSome()||HttpDate.parse("Wed Oct 21 07:28:00 2015").unwrap()!=1445412480){return 16;}
 if(HttpDate.parse("XYZ, 21 Oct 2015 07:28:00 GMT").isSome()){return 17;}
 if(!Representation.tagMatches("*",nullptr,false)||Representation.tagMatches("*bad","\"v1\"",false)){return 18;}
 app.destroy();return 0;
}`);
}, 90000);

test("entity tag matches require a complete valid list", () => {
  native(String.raw`
import [Representation] from "bpl-express";
frame main()ret int{
 if(Representation.tagMatches("\"v1\"garbage","\"v1\"",false)){return 1;}
 if(Representation.tagMatches("\"v1\", invalid","\"v1\"",true)){return 2;}
 if(Representation.tagMatches("\"v1\", *","\"v1\"",false)){return 3;}
 if(Representation.tagMatches("\"v1\", \"bad\nvalue\"","\"v1\"",false)){return 4;}
 if(!Representation.tagMatches("\"other\", W/\"v1\"","\"v1\"",false)){return 5;}
 if(!Representation.tagMatches("\"v1\", \"other\"","\"v1\"",true)){return 6;}
 if(Representation.tagMatches("W/\"v1\", \"other\"","\"v1\"",true)){return 7;}
 return 0;
}`);
}, 90000);
