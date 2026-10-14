import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [HttpParser], releaseStrings from "bpl-http-parser";
import strlen, free from "./libc.bpl";
export [HttpHeaders];
struct HttpHeaders {
    headers: Map<string,string>,
    frame new() ret HttpHeaders {local h:HttpHeaders;h.headers=Map<string,string>.new();return h;}
    frame lower(key:string) ret string {
        if(key==nullptr || key[0]==0){throw "Invalid HTTP header name";}
        local len:long=cast<long>(strlen(key));local copy:string=HttpParser.copy(key,0,len);
        loop(local i:long=0;i<len;i=i+1){if(!HttpParser.token(copy[i])){free(copy);throw "Invalid HTTP header name";}if(copy[i]>='A'&&copy[i]<='Z'){copy[i]=copy[i]+cast<char>(32);}}
        return copy;
    }
    frame set(this:*HttpHeaders,key:string,value:string){
        if(value==nullptr){throw "Invalid HTTP header value";}
        local len:long=cast<long>(strlen(value));
        loop(local i:long=0;i<len;i=i+1){if((value[i]<32 && value[i]!='\t')||value[i]==127){throw "Invalid HTTP header value";}}
        local name:string=HttpHeaders.lower(key);
        local copy:string=HttpParser.copy(value,0,len);
        HttpParser.put(&this.headers,name,copy);
    }
    frame get(this:*HttpHeaders,key:string) ret Option<string>{local name:string=HttpHeaders.lower(key);local result:Option<string>=this.headers.get(name);free(name);return result;}
    frame has(this:*HttpHeaders,key:string) ret bool{return this.get(key).isSome();}
    frame destroy(this:*HttpHeaders){releaseStrings(&this.headers);}
}
