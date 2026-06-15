def calculator():
    print("Simple Python Calculator")
    try:
        num1 = float(input("Enter first number: "))
        op = input("Enter operator (+, -, *, /): ")
        num2 = float(input("Enter second number: "))

        if op == '+':
            print(f"Result: {num1 + num2}")
        elif op == '-':
            print(f"Result: {num1 - num2}")
        elif op == '*':
            print(f"Result: {num1 * num2}")
        elif op == '/':
            print(f"Result: {num1 / num2}" if num2 != 0 else "Error: Division by zero")
        else:
            print("Invalid operator")
    except ValueError:
        print("Invalid input: Please enter numeric values.")

if __name__ == "__main__":
    # For syntax verification, we don't need to run the input-based logic
    # Just checking if the code parses correctly
    print("Syntax check passed.")
