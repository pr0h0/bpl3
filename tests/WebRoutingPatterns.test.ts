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
