import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("chunked requests decode incrementally and preserve separate validated trailers", () => {
  native(String.raw`
import [HttpParser], [ParsedRequest], [ChunkDecoder], [ChunkedBody] from "bpl-http-parser";
import [Option] from "std/option.bpl";
extern strlen(text:string)ret long;
extern strcmp(a:string,b:string)ret int;
frame invalid(raw:string,status:int)ret bool{local p:ParsedRequest=HttpParser.parseBytes(raw,strlen(raw));local good:bool=!p.valid&&p.error_code==status;p.destroy();return good;}
frame main()ret int{
 local body:string="2;foo=\"a\\\"b\"\r\nab\r\n1\r\nc\r\n0\r\nX-Checksum: done\r\n\r\n";
 loop(local i:long=0;i<strlen(body);i=i+1){local part:ChunkedBody=ChunkDecoder.parse(body,i);if(part.valid||part.error_code!=0){return 1;}part.destroy();}
 local decoded:ChunkedBody=ChunkDecoder.parse(body,strlen(body));if(!decoded.valid||decoded.body_length!=3||strcmp(decoded.body,"abc")!=0||strcmp(decoded.trailers.get("x-checksum").unwrap(),"done")!=0){return 2;}decoded.destroy();
 local raw:string="POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: ChUnKeD\r\n\r\n4\r\nABCD\r\n0\r\nX-Checksum: done\r\n\r\nGET /next HTTP/1.1\r\nHost: app\r\n\r\n";
 local p:ParsedRequest=HttpParser.parseBytes(raw,strlen(raw));if(!p.valid||p.body_length!=4||strcmp(p.body,"ABCD")!=0||p.message_length>=strlen(raw)||p.headers.has("x-checksum")||!p.trailers.has("x-checksum")){return 3;}p.destroy();
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",400)){return 4;}
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n",501)){return 5;}
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",400)){return 6;}
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nAuthorization: secret\r\n\r\n",400)){return 7;}
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: chunked\r\n\r\n100001\r\n",413)){return 8;}
 if(!invalid("POST / HTTP/1.1\r\nHost: app\r\nTransfer-Encoding: chunked\r\n\r\n1;foo=\"unterminated\r\na\r\n0\r\n\r\n",400)){return 9;}
 return 0;
}`);
}, 90000);
