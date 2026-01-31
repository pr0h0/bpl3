# Bug Hunt: Spec implementing itself
extern printf(fmt: string, ...);

spec SelfSpec: SelfSpec {
    frame method(this: *SelfSpec);
}

frame main() {
    printf("Test\n");
}
