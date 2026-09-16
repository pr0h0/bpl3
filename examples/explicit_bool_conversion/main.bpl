frame main() ret int {
    local value: int = 2;
    local enabled: bool = value != 0;
    local lowBit: bool = cast<bool>(value);
    if (!enabled || lowBit) return 1;
    return 0;
}
