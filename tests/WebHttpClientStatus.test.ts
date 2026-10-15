import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("HTTP client validates the status-line terminator and reason phrase bytes", () => {
  native(String.raw`
import [HttpResponse] from "bpl-http-client";
import [HttpParser] from "bpl-http-parser";
extern strlen(text:string)ret long;
extern free(text:string)ret void;
frame accepted(raw:string)ret bool{
 local response:*HttpResponse=HttpResponse.parseBytes(raw,strlen(raw),false);
 local valid:bool=response.status==200;response.destroy();return valid;
}
frame main()ret int{
 if(accepted("HTTP/1.1 200 OK\rXContent-Length: 0\r\n\r\n")){return 1;}
 if(accepted("HTTP/1.1 200 O\nK\r\nContent-Length: 0\r\n\r\n")){return 2;}
 local template:string="HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
 local size:long=strlen(template);
 local raw:string=HttpParser.copy(template,0,size);defer free(raw);
 loop(local code:int=0;code<256;code=code+1){
  raw[13]=cast<char>(code);
  local response:*HttpResponse=HttpResponse.parseBytes(raw,size,false);
  local valid:bool=response.status==200;response.destroy();
  local expected:bool=(code==9)||((code>=32)&&(code!=127));
  if(valid!=expected){return 3;}
 }
 if(!accepted("HTTP/1.1 200 \r\n\r\n")){return 4;}
 if(!accepted("HTTP/1.0 200 Fine\tresponse\r\nContent-Length: 0\r\n\r\n")){return 5;}
 return 0;
}`);
}, 90000);
