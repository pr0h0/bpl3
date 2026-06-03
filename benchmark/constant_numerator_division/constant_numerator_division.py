iterations = 8000000
numerator = 123456789
total = 0

for i in range(iterations):
    denom = (i % 997) + 1
    total += (numerator // denom) + (numerator % denom)

print(f"Constant numerator: {total}")
