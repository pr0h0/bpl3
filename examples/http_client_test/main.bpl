import [RequestBuilder], [HttpClient], [HttpResponse], [HttpMethod], [HttpHeaders], printf from "bpl-http-client";
import [String] from "string";

frame main() {
    printf("--- HTTP Client Comprehensive Test ---\n");

    # Test 1: Simple GET
    printf("\n[Test 1] GET http://example.com/\n");
    local rb1: RequestBuilder = RequestBuilder.new("http://example.com/");
    rb1.setMethod(HttpMethod.GET);
    local req1: *RequestBuilder = rb1.build();

    local res1: *HttpResponse = req1.send();
    printf("Status: %d\n", res1.status);
    if (res1.status == 200) {
        printf("Success!\n");
        printf("Response Body (first 200 chars):\n%200s\n", res1.body);
    } else {
        printf("Failed status.\n");
    }

    # Test 2: Custom Headers
    printf("\n[Test 2] GET with Headers\n");
    local rb2: RequestBuilder = RequestBuilder.new("http://example.com/");
    rb2.header("User-Agent", "BPL-Client/1.0");
    rb2.header("Accept", "text/html");
    local req2: *RequestBuilder = rb2.build();

    local res2: *HttpResponse = req2.send();
    printf("Status: %d\n", res2.status);

    # Test 3: POST with Body (JSON)
    printf("\n[Test 3] POST http://example.com/ \n");
    local rb3: RequestBuilder = RequestBuilder.new("http://example.com/");
    rb3.setMethod(HttpMethod.POST);

    local body: String = `{\"foo\":\"bar\"}`;
    defer body.destroy();

    rb3.json(body.toString());

    local req3: *RequestBuilder = rb3.build();

    local res3: *HttpResponse = req3.send();
    printf("Status: %d\n", res3.status);

    # Test 4: Custom Method
    printf("\n[Test 4] CUSTOM METHOD PROPFIND\n");
    local rb4: RequestBuilder = RequestBuilder.new("http://example.com/");
    rb4.methodCustom("PROPFIND");
    local req4: *RequestBuilder = rb4.build();

    local res4: *HttpResponse = req4.send();
    printf("Status: %d\n", res4.status);

    printf("\n--- Tests Completed ---\n");
}
