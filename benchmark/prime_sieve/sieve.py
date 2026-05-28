def main():
    limit = 10000000
    size = limit + 1
    is_prime = bytearray([1]) * size
    is_prime[0] = 0
    is_prime[1] = 0

    p = 2
    while p * p <= limit:
        if is_prime[p]:
            for j in range(p * p, limit + 1, p):
                is_prime[j] = 0
        p += 1

    count = sum(1 for x in is_prime if x)
    print(f"Primes up to {limit}: {count}")


if __name__ == "__main__":
    main()
