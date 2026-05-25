# Comprehensive Pattern Guards Example
# Shows various use cases for conditional pattern matching

extern printf(fmt: string, ...) ret int;

enum Temperature {
    Celsius(int),
    Fahrenheit(int),
    Kelvin(int),
}

enum Status {
    Ready,
    Loading(int), # Progress percentage
    Error(string),
}

# Classify temperature readings
frame classifyTemp(temp: Temperature) ret string {
    return match (temp) {
        Temperature.Celsius(c) if c > 30 => "hot",
        Temperature.Celsius(c) if c > 15 => "warm",
        Temperature.Celsius(c) if c > 0 => "cool",
        Temperature.Celsius(c) => "cold",
        Temperature.Fahrenheit(f) if f > 86 => "hot",
        Temperature.Fahrenheit(f) if f > 59 => "warm",
        Temperature.Fahrenheit(f) if f > 32 => "cool",
        Temperature.Fahrenheit(f) => "cold",
        Temperature.Kelvin(k) if k > 303 => "hot",
        Temperature.Kelvin(k) if k > 288 => "warm",
        Temperature.Kelvin(k) if k > 273 => "cool",
        Temperature.Kelvin(k) => "cold",
    };
}

# Check loading progress with guards
frame checkStatus(s: Status) ret int {
    return match (s) {
        Status.Ready => 0,
        Status.Loading(pct) if pct >= 100 => 100, # Complete
        Status.Loading(pct) if pct >= 75 => 75, # Almost done
        Status.Loading(pct) if pct >= 50 => 50, # Halfway
        Status.Loading(pct) if pct >= 25 => 25, # Quarter
        Status.Loading(pct) => pct, # Any other progress
        Status.Error(_) => -1, # Error state
    };
}

# Guards with complex conditions
frame validateProgress(s: Status) ret string {
    return match (s) {
        Status.Loading(p) if (p >= 0) && (p <= 100) => "valid",
        Status.Loading(p) if p < 0 => "negative progress",
        Status.Loading(p) if p > 100 => "exceeds 100%",
        Status.Loading(p) => "invalid",
        Status.Ready => "ready",
        Status.Error(_) => "error",
    };
}

frame main() ret int {
    printf("=== Temperature Classification ===\n");
    local t1: Temperature = Temperature.Celsius(35);
    local t2: Temperature = Temperature.Celsius(20);
    local t3: Temperature = Temperature.Celsius(5);
    local t4: Temperature = Temperature.Celsius(-10);

    printf("35C: %s\n", classifyTemp(t1));
    printf("20C: %s\n", classifyTemp(t2));
    printf("5C: %s\n", classifyTemp(t3));
    printf("-10C: %s\n", classifyTemp(t4));

    printf("\n=== Fahrenheit ===\n");
    local f1: Temperature = Temperature.Fahrenheit(95);
    local f2: Temperature = Temperature.Fahrenheit(68);
    printf("95F: %s\n", classifyTemp(f1));
    printf("68F: %s\n", classifyTemp(f2));

    printf("\n=== Kelvin ===\n");
    local k1: Temperature = Temperature.Kelvin(310);
    local k2: Temperature = Temperature.Kelvin(289);
    local k3: Temperature = Temperature.Kelvin(274);
    local k4: Temperature = Temperature.Kelvin(260);
    printf("310K: %s\n", classifyTemp(k1));
    printf("289K: %s\n", classifyTemp(k2));
    printf("274K: %s\n", classifyTemp(k3));
    printf("260K: %s\n", classifyTemp(k4));

    printf("\n=== Loading Progress ===\n");
    local s1: Status = Status.Loading(0);
    local s2: Status = Status.Loading(30);
    local s3: Status = Status.Loading(60);
    local s4: Status = Status.Loading(80);
    local s5: Status = Status.Loading(100);

    printf("Progress 0%%: %d\n", checkStatus(s1));
    printf("Progress 30%%: %d\n", checkStatus(s2));
    printf("Progress 60%%: %d\n", checkStatus(s3));
    printf("Progress 80%%: %d\n", checkStatus(s4));
    printf("Progress 100%%: %d\n", checkStatus(s5));

    printf("\n=== Progress Validation ===\n");
    local v1: Status = Status.Loading(50);
    local v2: Status = Status.Loading(-5);
    local v3: Status = Status.Loading(150);
    local v4: Status = Status.Ready;
    local v5: Status = Status.Error("network");

    printf("50%%: %s\n", validateProgress(v1));
    printf("-5%%: %s\n", validateProgress(v2));
    printf("150%%: %s\n", validateProgress(v3));
    printf("Ready: %s\n", validateProgress(v4));
    printf("Error: %s\n", validateProgress(v5));

    return 0;
}
