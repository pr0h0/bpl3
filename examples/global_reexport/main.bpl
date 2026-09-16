import forwarded from "./bridge.bpl";
frame main() ret int {
    forwarded += 1;
    return forwarded - 43;
}
