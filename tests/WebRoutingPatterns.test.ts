import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("route parameter extraction treats nonterminal asterisks as literal characters", () => {
  native(String.raw`
import [Router] from "bpl-express";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import releaseStrings from "bpl-http-parser";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 local router:Router=Router.new();local owner:*Router=&router;defer owner.destroy();
 local params:Map<string,string>=Map<string,string>.new();defer releaseStrings(&params);
 if(!router.matchPath("/files*/:id","/files*/42",&params)){return 1;}
 if(!params.get("id").isSome()||strcmp(params.get("id").unwrap(),"42")!=0){return 2;}
 if(router.matchPath("/files*/:id","/files/42",&params)){return 3;}
 if(!router.matchPath("/files*/:id/*","/files*/43/tail/part",&params)){return 4;}
 if(strcmp(params.get("id").unwrap(),"43")!=0){return 5;}
 return 0;
}`);
}, 90000);

// BUG-463: path parameters were passed through percent-encoded.
test("route parameters are percent-decoded; invalid escapes do not match", () => {
  native(String.raw`
import [Router] from "bpl-express";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import releaseStrings from "bpl-http-parser";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 local router:Router=Router.new();local owner:*Router=&router;defer owner.destroy();
 local params:Map<string,string>=Map<string,string>.new();defer releaseStrings(&params);
 if(!router.matchPath("/users/:name","/users/John%20Doe",&params)){return 1;}
 if(strcmp(params.get("name").unwrap(),"John Doe")!=0){return 2;}
 if(!router.matchPath("/q/:v","/q/a+b",&params)){return 3;}
 if(strcmp(params.get("v").unwrap(),"a+b")!=0){return 4;}
 if(router.matchPath("/users/:name","/users/bad%2",&params)){return 5;}
 if(router.matchPath("/users/:name","/users/nul%00",&params)){return 6;}
 # A failed match adds no parameters, even ones that decoded.
 local fresh:Map<string,string>=Map<string,string>.new();defer releaseStrings(&fresh);
 if(router.matchPath("/users/:id/:rest","/users/alice/%2",&fresh)){return 7;}
 if(fresh.get("id").isSome()){return 8;}
 return 0;
}`);
}, 90000);
