import [HttpClient], [HttpResponse], [RequestBuilder], [HttpMethod] from "./src/client.bpl";
import [HttpHeaders] from "./src/headers.bpl";
extern printf(fmt: string, ...) ret int;

export [HttpClient];
export [HttpResponse];
export [RequestBuilder];
export [HttpHeaders];
export [HttpMethod];
export printf;
