import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("HTTP URL schemes accept ASCII case variants without changing hosts or request targets", () => {
  native(String.raw`
import [Url] from "bpl-http-client";
import [HttpParser] from "bpl-http-parser";
extern strlen(text:string)ret long;
extern strcmp(a:string,b:string)ret int;
extern free(data:string);
frame check(base:string,letters:int,variants:int,secure:bool,port:int)ret bool{
 local raw:string=HttpParser.copy(base,0,strlen(base));defer free(raw);
 loop(local mask:int=0;mask<variants;mask=mask+1){
  loop(local i:int=0;i<letters;i=i+1){raw[i]=base[i];if((mask&(1<<i))!=0){raw[i]=raw[i]-cast<char>(32);}}
  local url:Url=Url.parse(raw);
  local ok:bool=url.valid&&(url.secure==secure)&&(url.port==port);
  if(ok){ok=(strcmp(url.host,"Example.COM")==0)&&(strcmp(url.path,"/Path?Key=Value")==0);}
  url.destroy();if(!ok){return false;}
 }
 return true;
}
frame main()ret int{
 if(!check("http://Example.COM/Path?Key=Value#fragment",4,16,false,80)){return 1;}
 if(!check("https://Example.COM/Path?Key=Value#fragment",5,32,true,443)){return 2;}
 if(!check("https://Example.COM:8443/Path?Key=Value#fragment",5,32,true,8443)){return 3;}
 local url:Url=Url.parse("HTTPSX://example.com/");if(url.valid){return 4;}url.destroy();
 url=Url.parse("ftp://example.com/");if(url.valid){return 5;}url.destroy();return 0;
}`);
}, 90000);
