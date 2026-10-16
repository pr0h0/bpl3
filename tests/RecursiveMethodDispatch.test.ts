import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("recursive overriding methods and destructors keep their declaring type", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `global calls:int=0;
 struct Base{frame visit(this:*Base)ret int{return 100;}}
 struct Node:Base{child:*Node,
 frame visit(this:*Node)ret int{calls=calls+1;if(this.child==nullptr){return 1;}return 1+this.child.visit();}
 frame destroy(this:*Node){calls=calls+1;if(this.child!=nullptr){this.child.destroy();}}}
 frame main()ret int{local leaf:Node;local middle:Node;local root:Node;leaf.child=nullptr;middle.child=&leaf;root.child=&middle;
 calls=0;local count:int=root.visit();if(count!=3||calls!=3){return 1;}
 calls=0;root.destroy();if(calls!=3){return 2;}return 0;}`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
