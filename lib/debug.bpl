
export [Debug];

import frameaddress, returnaddress, dladdr, [Dl_info] from "std/intrinsics.bpl";
extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct Debug {
    # Captures the current stack trace into a buffer of pointers.
    # Returns the number of frames captured.
    # buffer: pointer to array of *void
    # max_frames: size of the buffer
    frame captureStackTrace(buffer: **void, max_frames: int) ret int {
        local count: int = 0;
        local fp: *void = frameaddress(0);
        
        # Skip the current frame (captureStackTrace)
        if (cast<long>(fp) != 0) {
            local fp_ptr: **void = cast<**void>(fp);
            fp = fp_ptr[0];
        }

        loop (count < max_frames) {
            if (cast<long>(fp) == 0) { break; }
            
            local fp_ptr: **void = cast<**void>(fp);
            local prev_fp: *void = fp_ptr[0];
            
            # Sanity check: Stack grows down, so previous frame should be at higher address
            if (cast<long>(prev_fp) <= cast<long>(fp)) {
                break;
            }
            
            # Return Address is at RBP + 8 (index 1)
            local ra: *void = fp_ptr[1];
            
            buffer[count] = ra;
            count = count + 1;
            
            fp = prev_fp;
        }
        
        return count;
    }

    frame printStackTrace() {
        local max_frames: int = 32;
        local buffer: **void = cast<**void>(malloc(cast<long>(max_frames * 8)));
        
        local count: int = Debug.captureStackTrace(buffer, max_frames);
        
        printf("Stack Trace:\n");
        local i: int = 0;
        local info: Dl_info;
        
        loop (i < count) {
            local addr: *void = buffer[i];
            if (dladdr(addr, &info) != 0) {
                if (info.dli_sname != nullptr) {
                    printf("  [%d] %p %s\n", i, addr, info.dli_sname);
                } else {
                    printf("  [%d] %p <unknown>\n", i, addr);
                }
            } else {
                printf("  [%d] %p\n", i, addr);
            }
            i = i + 1;
        }
        
        free(cast<*void>(buffer));
    }
}
