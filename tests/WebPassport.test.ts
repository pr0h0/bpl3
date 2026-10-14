import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("named local strategies verify credentials, reject failures and erase request passwords", () => {
  native(String.raw`
import [Passport] from "bpl-passport";
import [LocalStrategy] from "bpl-passport-local";
import [Request], [Response] from "bpl-express";
import [HttpParser] from "bpl-http-parser";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern strcmp(a:string,b:string) ret int;
extern strlen(text:string) ret ulong;
local calls:int=0;
frame verify(context:*void,_req:*Request,_res:*Response,username:string,password:string)ret long{
  calls=calls+1;
  if(context==nullptr){return 0;}
  if(strcmp(username,"student")==0&&strcmp(password,"test-password")==0){return 42;}
  return 0;
}
frame attempt(passport:*Passport,json:string,expected:long,status:int)ret bool{
  local req:Request=Request.new();local res:Response=Response.new(-1);
  req.body=HttpParser.copy(json,0,cast<long>(strlen(json)));req.body_length=cast<long>(strlen(json));
  local user:long=passport.authenticate("local",&req,&res);
  local ok:bool=(user==expected)&&(res.status_code==status);
  loop(local i:long=0;i<req.body_length;i=i+1){if(req.body[i]!=0){ok=false;}}
  req.destroy();res.destroy();return ok;
}
frame main()ret int{
  local marker:int=1;local passport:Passport=Passport.new();local strategy:LocalStrategy=LocalStrategy.new(cast<*void>(&marker),verify);
  strategy.install(&passport,"local");
  if(!attempt(&passport,"{\"username\":\"student\",\"password\":\"test-password\"}",42,200)){return 1;}
  if(!attempt(&passport,"{\"username\":\"student\",\"password\":\"wrong\"}",0,401)){return 2;}
  if(!attempt(&passport,"{\"username\":\"student\"}",0,422)){return 3;}
  if(!attempt(&passport,"{",0,400)){return 4;}
  if(!attempt(&passport,"{\"username\":\"\",\"password\":\"test-password\"}",0,422)){return 11;}
  if(!attempt(&passport,"{\"username\":\"student\",\"password\":\"\"}",0,422)){return 12;}
  if(!attempt(&passport,"{\"username\":\"student\",\"password\":null}",0,400)){return 13;}
  if(!attempt(&passport,"{\"username\":\"student\",\"password\":\"test-password\\u0000suffix\"}",0,400)){return 14;}
  local large:char[2050];loop(local i:int=0;i<2049;i=i+1){large[i]='a';}large[2049]=0;
  if(!attempt(&passport,cast<string>(&large[0]),0,400)){return 15;}
  local req:Request=Request.new();local res:Response=Response.new(-1);
  if(passport.authenticate("local",&req,&res)!=0||res.status_code!=400){return 16;}
  req.destroy();res.destroy();
  req=Request.new();res=Response.new(-1);req.body=HttpParser.copy("xxxx",0,4);req.body[1]=0;req.body_length=4;
  if(passport.authenticate("local",&req,&res)!=0||res.status_code!=400){return 17;}
  loop(local i:int=0;i<4;i=i+1){if(req.body[i]!=0){return 18;}}
  req.destroy();res.destroy();
  if(calls!=2){return 5;}
  passport.destroy();return 0;
}`);
}, 90000);

test("Passport fails closed, owns names, and preserves strategy errors", () => {
  native(String.raw`
import [Passport], [StrategyHandler] from "bpl-passport";
import [LocalStrategy], [LocalVerifier] from "bpl-passport-local";
import [Request], [Response] from "bpl-express";
import [HttpParser] from "bpl-http-parser";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern strlen(text:string)ret ulong;
local calls:int=0;
frame reject(_context:*void,_req:*Request,_res:*Response)ret long{calls=calls+1;return -42;}
frame blocked(_context:*void,_req:*Request,res:*Response)ret long{res.status(429).json("{}");return 42;}
frame throws(_context:*void,_req:*Request,_res:*Response,_username:string,_password:string)ret long{throw "verifier failure";}
frame main()ret int{
  local passport:Passport=Passport.new();local req:Request=Request.new();local res:Response=Response.new(-1);
  local name:String=String.new("reject");passport.use(name.data,reject,nullptr);name.destroy();
  if(passport.authenticate("reject",&req,&res)!=0||res.status_code!=401||calls!=1){return 1;}
  if(passport.authenticate("reject",&req,&res)!=0||calls!=1){return 2;}
  res.destroy();res=Response.new(-1);
  local caught:bool=false;try{passport.authenticate("missing",&req,&res);}catch{caught=true;}
  if(!caught||res.body_sent){return 3;}
  caught=false;try{passport.use("reject",reject,nullptr);}catch{caught=true;}if(!caught){return 4;}
  caught=false;try{passport.use("",reject,nullptr);}catch{caught=true;}if(!caught){return 5;}
  caught=false;try{passport.use("null",cast<StrategyHandler>(cast<*void>(nullptr)),nullptr);}catch{caught=true;}if(!caught){return 6;}
  caught=false;try{LocalStrategy.new(nullptr,cast<LocalVerifier>(cast<*void>(nullptr)));}catch{caught=true;}if(!caught){return 7;}
  passport.use("blocked",blocked,nullptr);
  if(passport.authenticate("blocked",&req,&res)!=0||res.status_code!=429){return 8;}
  res.destroy();res=Response.new(-1);
  local strategy:LocalStrategy=LocalStrategy.new(nullptr,throws);strategy.install(&passport,"throws");
  local payload:string="{\"username\":\"student\",\"password\":\"secret\"}";
  req.body_length=cast<long>(strlen(payload));req.body=HttpParser.copy(payload,0,req.body_length);
  caught=false;try{passport.authenticate("throws",&req,&res);}catch{caught=true;}
  if(!caught){return 9;}
  loop(local i:long=0;i<req.body_length;i=i+1){if(req.body[i]!=0){return 10;}}
  req.destroy();res.destroy();passport.destroy();passport.destroy();return 0;
}`);
}, 90000);
