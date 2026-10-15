import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("request lines require CRLF without skipping an arbitrary byte", () => {
  native(String.raw`
import [HttpParser], [ParsedRequest] from "bpl-http-parser";
extern strlen(text:string)ret long;
extern free(text:string);
frame main()ret int{
 local template:string="GET / HTTP/1.1\r\nHost: x\r\n\r\n";
 local size:long=strlen(template);local newline:long=strlen("GET / HTTP/1.1\r");
 local raw:string=HttpParser.copy(template,0,size);defer free(raw);
 loop(local code:int=0;code<256;code=code+1){
  raw[newline]=cast<char>(code);local request:ParsedRequest=HttpParser.parseBytes(raw,size);
  local ok:bool=(request.valid==(code==10));
  if(code!=10){ok=ok&&(request.error_code==400);}request.destroy();if(!ok){return 1;}
 }
 local request:ParsedRequest=HttpParser.parse("GET / HTTP/1.0\r\n\r\n");local ok:bool=request.valid;request.destroy();if(!ok){return 2;}
 request=HttpParser.parse("GET / HTTP/1.1\r");ok=!request.valid&&(request.error_code==0);request.destroy();if(!ok){return 3;}
 return 0;
}`);
}, 90000);
