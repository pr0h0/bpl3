def main():
    sum = 0
    iterations = 20000000

    for i in range(iterations):
        sum = ((sum * 3) + i) % 1000003

    print(f"Loop sum: {sum}")


if __name__ == "__main__":
    main()
