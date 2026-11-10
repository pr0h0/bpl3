import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("validation detects overflow and records structured errors", () => {
  native(`
    import [Validator] from "bpl-validation";
    import [Option] from "std/option.bpl";import [String] from "std/string.bpl";import [Array] from "std/array.bpl";
    extern strlen(s:string) ret long;extern strcmp(a:string,b:string) ret int;extern strstr(a:string,b:string) ret string;
    frame main() ret int {
      local v:Validator=Validator.new();
      if(v.integer("id","2147483648",-2147483648,2147483647).isSome()){return 1;}
      if(v.integer("minimum","-2147483648",-2147483648,2147483647).unwrap()!=-2147483648){return 2;}
      if(v.integer("bad","12oops",0,100).isSome()){return 3;}
      v.required("title","").length("title","",3,80);if(v.ok()){return 4;}
      local allowed:Array<string>=Array<string>.new(2);allowed.push("open");allowed.push("done");v.oneOf("state","done",&allowed);
      local json:String=v.json();if(strstr(json.data,"\\\"title\\\":\\\"required\\\"")==nullptr){return 5;}json.destroy();v.destroy();allowed.destroy();
      return 0;
    }
  `);
}, 90000);

test("validation rules for numbers, booleans, emails, URLs, UUIDs, dates, patterns and confirmations", () => {
  native(String.raw`
    import [Validator] from "bpl-validation";
    import [Option] from "std/option.bpl";
    extern strcmp(a: string, b: string) ret int;
    frame code(v: *Validator, field: string) ret string {
        local found: Option<string> = v.error(field);
        if (!found.isSome()) {
            return "";
        }
        return found.unwrap();
    }
    frame main() ret int {
        local v: Validator = Validator.new();
        if (v.number("price", "12.50", 0.0, 100.0).unwrap() != 12.5 || v.number("t", "-1e3", -1000.0, 0.0).unwrap() != -1000.0) { return 1; }
        local bad: string[9] = ["", " 1", "+1", "1.", ".5", "0x10", "inf", "nan", "1e"];
        loop (local i: int = 0; i < 9; i = i + 1) {
            if (v.number("n", bad[i], 0.0, 1.0).isSome()) { return 2; }
        }
        if (v.number("big", "1e400", 0.0, 1.0).isSome() || v.number("r", "5", 0.0, 1.0).isSome() || strcmp(code(&v, "r"), "range") != 0 || strcmp(code(&v, "n"), "number") != 0) { return 3; }
        if (!v.boolean("a", "on").unwrap() || v.boolean("b", "0").unwrap() || v.boolean("c", "True").isSome() || strcmp(code(&v, "c"), "boolean") != 0) { return 4; }
        local w: Validator = Validator.new();
        w.email("e1", "ada@example.org").email("e2", "first.last+tag@sub.example.co").url("u1", "https://example.org/a?b#c").url("u2", "http://localhost:3000");
        w.uuid("id", "123e4567-E89B-12d3-a456-426614174000").date("d1", "2024-02-29").date("d2", "0001-01-01");
        w.matches("slug", "hello-world-2", "[a-z0-9]+(-[a-z0-9]+)*").same("confirm", "secret", "secret").check("custom", true, "nope");
        w.chars("name", "ééé", 3, 3);
        if (!w.ok()) { return 5; }
        w.destroy();
        local x: Validator = Validator.new();
        local emails: string[8] = ["plain", "@example.org", "a@b", "a@-b.org", "a@b-.org", "a b@c.org", "a@b..org", ".a@b.org"];
        loop (local i: int = 0; i < 8; i = i + 1) {
            local one: Validator = Validator.new();
            one.email("e", emails[i]);
            if (one.ok()) { return 10 + i; }
            one.destroy();
        }
        x.url("u1", "ftp://example.org").url("u2", "https://").url("u3", "https://exa mple.org").url("u4", "javascript:alert(1)").url("u5", "https://@x");
        if (x.count() != 5 || strcmp(code(&x, "u4"), "url") != 0) { return 20; }
        x.uuid("i1", "123e4567e89b12d3a456426614174000").uuid("i2", "123e4567-e89b-12d3-a456-42661417400g");
        x.date("d1", "2023-02-29").date("d2", "2024-13-01").date("d3", "2024-1-01").date("d4", "0000-01-01");
        x.matches("slug", "Hello", "[a-z]+").matches("slug2", "abc-", "[a-z]+").same("confirm", "a", "b").check("custom", false, "taken");
        x.chars("name", "éééé", 1, 3);
        if (x.count() != 16 || strcmp(code(&x, "d4"), "date") != 0 || strcmp(code(&x, "slug2"), "format") != 0 || strcmp(code(&x, "confirm"), "mismatch") != 0 || strcmp(code(&x, "custom"), "taken") != 0 || strcmp(code(&x, "name"), "length") != 0) { return 21; }
        local caught: int = 0;
        try { x.matches("p", "x", "(unclosed"); } catch { caught = caught + 1; }
        try { x.number("p", "1", 2.0, 1.0); } catch { caught = caught + 1; }
        try { x.chars("p", "x", 2, 1); } catch { caught = caught + 1; }
        if (caught != 3) { return 22; }
        x.destroy();
        v.destroy();
        return 0;
    }
  `);
}, 90000);
