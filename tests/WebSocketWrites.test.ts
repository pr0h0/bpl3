import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { native } from "./helpers/webPackages";

test.skipIf(process.platform !== "linux")(
  "HTTP socket writes retry interruptions and preserve offsets across partial writes",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-send-fixture-"));
    try {
      const shim = join(dir, "send.c");
      writeFileSync(
        shim,
        String.raw`
#include <errno.h>
#include <string.h>
#include <sys/socket.h>
static int mode, calls;
static char received[16];
static size_t used;
void configureSend(int value) { mode=value; calls=0; used=0; received[0]=0; }
int sendCalls(void) { return calls; }
const char *sentBytes(void) { return received; }
ssize_t __wrap_send(int fd, const void *data, size_t length, int flags) {
    (void)fd; (void)flags;
    calls++;
    if(calls==1) {
        if(mode==1) { errno=EINTR; return -1; }
        if(mode==2) { errno=EPIPE; return -1; }
        if(mode==3) { return 0; }
    }
    size_t count=length>2?2:length;
    if(used+count>=sizeof(received)) { errno=EOVERFLOW; return -1; }
    memcpy(received+used,data,count); used+=count; received[used]=0;
    return (ssize_t)count;
}
`,
      );
      native(
        String.raw`
import writeAll from "../packages/bpl-express/src/http.bpl";
extern configureSend(mode:int);
extern sendCalls()ret int;
extern sentBytes()ret string;
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 configureSend(1);if(!writeAll(7,"hello",5)){return 1;}
 if(sendCalls()!=4||strcmp(sentBytes(),"hello")!=0){return 2;}
 configureSend(2);if(writeAll(7,"hello",5)||sendCalls()!=1){return 3;}
 configureSend(3);if(writeAll(7,"hello",5)||sendCalls()!=1){return 4;}
 return 0;
}`,
        ["--clang-flag=-Wl,--wrap=send", `--clang-flag=${shim}`],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
