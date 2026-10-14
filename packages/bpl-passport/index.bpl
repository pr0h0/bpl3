import [Request], [Response] from "bpl-express";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern strcmp(a: string, b: string) ret int;
extern strlen(text: string) ret ulong;
export [Passport];
export [StrategyHandler];

# A positive user ID authenticates; zero or a negative value rejects.
type StrategyHandler = Func<long>(*void, *Request, *Response);
struct Strategy {
    name: String,
    handler: StrategyHandler,
    context: *void,
}
struct Passport {
    strategies: Array<Strategy>,
    frame new() ret Passport {
        local result: Passport;
        result.strategies = Array<Strategy>.new(2);
        return result;
    }
    frame use(this: *Passport, name: string, handler: StrategyHandler, context: *void) {
        if ((name == nullptr) || (strlen(name) == 0) || (strlen(name) > 64) || (cast<*void>(handler) == nullptr)) {
            throw "Invalid authentication strategy";
        }
        loop (local i: int = 0; i < this.strategies.len(); i = i + 1) {
            local current: Strategy = this.strategies.get(i);
            if (strcmp(current.name.data, name) == 0) {
                throw "Authentication strategy already registered";
            }
        }
        local strategy: Strategy;
        strategy.name = String.new(name);
        strategy.handler = handler;
        strategy.context = context;
        # Array.push may allocate; retain ownership until it succeeds.
        try {
            this.strategies.push(strategy);
        } catch {
            strategy.name.destroy();
            throw "Authentication strategy allocation failed";
        }
    }
    frame authenticate(this: *Passport, name: string, req: *Request, res: *Response) ret long {
        if (res.body_sent) {
            return 0;
        }
        if (name == nullptr) {
            throw "Unknown authentication strategy";
        }
        loop (local i: int = 0; i < this.strategies.len(); i = i + 1) {
            local strategy: Strategy = this.strategies.get(i);
            if (strcmp(strategy.name.data, name) == 0) {
                local user: long = strategy.handler(strategy.context, req, res);
                if (res.body_sent) {
                    return 0;
                }
                if (user > 0) {
                    return user;
                }
                res.status(401).json("{\"error\":\"invalid username or password\"}");
                return 0;
            }
        }
        throw "Unknown authentication strategy";
    }
    frame destroy(this: *Passport) {
        loop (local i: int = 0; i < this.strategies.len(); i = i + 1) {
            local strategy: Strategy = this.strategies.get(i);
            strategy.name.destroy();
        }
        this.strategies.destroy();
    }
}
