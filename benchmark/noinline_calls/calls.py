def mix(value, i):
    return ((value * 17) + (i % 1009) + 23) % 1000003


def main():
    iterations = 20000000
    value = 7

    for i in range(iterations):
        value = mix(value, i)

    print(f"Call sum: {value}")


if __name__ == "__main__":
    main()
