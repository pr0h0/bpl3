import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("argument parser honors defaults, required arguments and selected actions", () => {
  const source = `import [ArgParser],[Command],[Flag],[Argument],[ParsedArgs] from "std/arg_parser.bpl";
import [Args] from "std/args.bpl";
extern free(ptr:*void);extern strcmp(a:string,b:string)ret int;
global calls:int=0;
frame action(parsed:*ParsedArgs)ret int{
 calls=calls+1;
 if(strcmp(parsed.getFlag("--name").unwrap().data,"guest")!=0){return 8;}
 return 7;
}
frame drop(parsed:*ParsedArgs){parsed.destroy();free(cast<*void>(parsed));}
frame main()ret int{
 local root:*Command=Command.new("app","root");
 root.addFlag(Flag.new("--name","-n","name",true).withDefault("guest"));
 root.addFlag(Flag.new("--empty","","empty",true).withDefault(""));
 local sub:*Command=Command.new("run","run");
 sub.addArgument(Argument.new("file","file",true));sub.setAction(action);root.addSubcommand(sub);
 local parser:ArgParser=ArgParser.new(root);local argv:string[5];
 argv[0]="app";argv[1]="run";argv[2]="-5";
 local args:Args=Args.new(3,&argv[0]);local parsed:*ParsedArgs=parser.parse(&args);
 if(parsed.errorCount!=0||parsed.exitCode!=7||calls!=1){return 1;}
 if(strcmp(parsed.getFlag("-n").unwrap().data,"guest")!=0||!parsed.hasFlag("--empty")||parsed.getArg(-1).isSome()){return 2;}
 if(strcmp(parsed.getArg(0).unwrap().data,"-5")!=0){return 3;}drop(parsed);
 args=Args.new(2,&argv[0]);parsed=parser.parse(&args);
 if(parsed.errorCount!=1||parsed.exitCode!=1||calls!=1){return 4;}drop(parsed);
 argv[2]="--";argv[3]="run";argv[4]="--name";args=Args.new(5,&argv[0]);parsed=parser.parse(&args);
 if(parsed.commandPath.len()!=2||parsed.positional.len()!=2||parsed.errorCount!=0||calls!=2){return 5;}drop(parsed);
 argv[1]="--name=admin";args=Args.new(2,&argv[0]);parsed=parser.parse(&args);
 if(strcmp(parsed.getFlag("-n").unwrap().data,"admin")!=0||calls!=2){return 6;}drop(parsed);
 root.destroy();free(cast<*void>(root));return 0;
}`;
  const sanitizerFlags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  for (const opt of [0, 3])
    native(source, ["-O", String(opt), ...sanitizerFlags]);
}, 120000);

test("argument parser frees its result if a command action throws", () => {
  const source = `import [ArgParser],[Command],[Flag],[ParsedArgs] from "std/arg_parser.bpl";
import [Args] from "std/args.bpl";
extern free(ptr:*void);
frame action(parsed:*ParsedArgs)ret int{parsed;throw 7;}
frame main()ret int{
 local root:*Command=Command.new("app","root");root.setAction(action);
 root.addFlag(Flag.new("--name","-n","name",true).withDefault("guest"));
 local parser:ArgParser=ArgParser.new(root);local argv:string[1]=["app"];
 local args:Args=Args.new(1,&argv[0]);local caught:int=0;
 loop(local i:int=0;i<10;i=i+1){
  try{local parsed:*ParsedArgs=parser.parse(&args);parsed.destroy();free(cast<*void>(parsed));}
  catch(e:int){if(e==7){caught=caught+1;}}
 }
 root.destroy();free(cast<*void>(root));
 if(caught!=10){return 1;}return 0;
}`;
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
