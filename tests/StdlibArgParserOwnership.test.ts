import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("argument parsing releases token and flag temporaries on ordinary and diagnostic paths", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [ArgParser],[Command],[Flag],[ParsedArgs] from "std/arg_parser.bpl";
 import [Args] from "std/args.bpl";
 extern free(ptr:*void);extern strcmp(a:string,b:string)ret int;
 frame drop(parsed:*ParsedArgs){parsed.destroy();free(cast<*void>(parsed));}
 frame diagnostic(parser:*ArgParser,argv:*string,count:int){local args:Args=Args.new(count,argv);try{local parsed:*ParsedArgs=parser.parse(&args);if(parsed!=nullptr){drop(parsed);}}catch{}}
 frame main()ret int{
  local root:*Command=Command.new("app","root");root.addFlag(Flag.new("--name","-n","name",true));root.addFlag(Flag.new("--verbose","-v","verbose",false));
  local sub:*Command=Command.new("run","sub");sub.addFlag(Flag.new("--count","-c","count",true));root.addSubcommand(sub);
  local parser:ArgParser=ArgParser.new(root);local argv:string[7];
  loop(local cycle:int=0;cycle<30;cycle=cycle+1){
   argv[0]="app";argv[1]="--name";argv[2]="Ada";argv[3]="--verbose";argv[4]="run";argv[5]="--count=2";argv[6]="tail";
   local args:Args=Args.new(7,&argv[0]);local parsed:*ParsedArgs=parser.parse(&args);
   local ok:bool=parsed.commandPath.len()==2&&strcmp(parsed.getFlag("--name").unwrap().data,"Ada")==0&&strcmp(parsed.getFlag("-n").unwrap().data,"Ada")==0&&strcmp(parsed.getFlag("--count").unwrap().data,"2")==0&&strcmp(parsed.getArg(0).unwrap().data,"tail")==0;
   drop(parsed);if(!ok){return 1;}
   argv[1]="-n=Grace";argv[2]="--name=Hopper";argv[5]="-c";argv[6]="3";
   parsed=parser.parse(&args);ok=strcmp(parsed.getFlag("-n").unwrap().data,"Hopper")==0&&strcmp(parsed.getFlag("-c").unwrap().data,"3")==0;drop(parsed);if(!ok){return 2;}
  }
  argv[1]="--verbose=true";diagnostic(&parser,&argv[0],2);
  argv[1]="--name";diagnostic(&parser,&argv[0],2);
  argv[1]="--unknown";diagnostic(&parser,&argv[0],2);
  diagnostic(&parser,&argv[0],1);root.destroy();free(cast<*void>(root));return 0;
 }`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
