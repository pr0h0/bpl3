import [Passport] from "bpl-passport";
import [Request], [Response] from "bpl-express";
import [JSON] from "std/json.bpl";
extern strlen(text: string) ret ulong;
extern explicit_bzero(data: *void, size: ulong) ret void;
export [LocalStrategy];
export [LocalVerifier];
export [LocalCredentials];
type LocalVerifier = Func<long>(*void, *Request, *Response, string, string);

struct LocalCredentials {
    username: string,
    password: string,
    frame wipe(req: *Request) {
        if ((req.body != nullptr) && (req.body_length > 0)) {
            explicit_bzero(cast<*void>(req.body), cast<ulong>(req.body_length));
        }
    }
    frame destroy(this: *LocalCredentials, req: *Request) {
        if (this.password != nullptr) {
            explicit_bzero(cast<*void>(this.password), strlen(this.password));
        }
        LocalCredentials.wipe(req);
        JSON.free<LocalCredentials>(this);
    }
    frame parse(req: *Request, res: *Response) ret *LocalCredentials {
        if ((req.body == nullptr) || (req.body_length < 0) || (req.body_length > 2048)) {
            res.status(400).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        if (cast<long>(strlen(req.body)) != req.body_length) {
            res.status(400).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        local body: *LocalCredentials = JSON.parse<LocalCredentials>(req.body);
        if (body == nullptr) {
            res.status(400).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        if ((body.username == nullptr) || (body.password == nullptr)) {
            body.destroy(req);
            res.status(422).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        if ((strlen(body.username) < 1) || (strlen(body.username) > 256) || (strlen(body.password) < 1) || (strlen(body.password) > 256)) {
            body.destroy(req);
            res.status(422).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        return body;
    }
}
frame localAuthenticate(context: *void, req: *Request, res: *Response) ret long {
    local strategy: *LocalStrategy = cast<*LocalStrategy>(context);
    defer LocalCredentials.wipe(req);
    local body: *LocalCredentials = LocalCredentials.parse(req, res);
    if (body == nullptr) {
        return 0;
    }
    defer body.destroy(req);
    return strategy.verify(strategy.context, req, res, body.username, body.password);
}
struct LocalStrategy {
    context: *void,
    verify: LocalVerifier,
    frame new(context: *void, verify: LocalVerifier) ret LocalStrategy {
        if (cast<*void>(verify) == nullptr) {
            throw "Local strategy requires a verifier";
        }
        local result: LocalStrategy;
        result.context = context;
        result.verify = verify;
        return result;
    }
    frame install(this: *LocalStrategy, passport: *Passport, name: string) {
        passport.use(name, localAuthenticate, cast<*void>(this));
    }
}
