from array import array


def main():
    count = 6000000
    a = array("q", (0 for _ in range(count)))
    b = array("q", (0 for _ in range(count)))

    for i in range(count):
        a[i] = (i % 97) - 48
        b[i] = (i % 89) - 44

    total = 0
    for i in range(count):
        total += a[i] * b[i]

    print(f"Vector dot: {total}")


if __name__ == "__main__":
    main()
