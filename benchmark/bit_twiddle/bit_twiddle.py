def main():
    iterations = 20000000
    x = 2463534242
    total = 0
    mask = 0xFFFFFFFF

    for _ in range(iterations):
        x = (x ^ (x << 13)) & mask
        x = (x ^ (x >> 17)) & mask
        x = (x ^ (x << 5)) & mask
        total = (total + (x & 1023)) & mask

    print(f"Bit twiddle: {x} {total}")


if __name__ == "__main__":
    main()
