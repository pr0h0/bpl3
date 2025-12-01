# ==================================================================================
# Enterprise Resource Planning (ERP) System v1.0
# ----------------------------------------------------------------------------------
# This example demonstrates the full capabilities of the language, including:
# - Structures (Employee, Task) & Linked Lists
# - Dynamic Memory Management (malloc)
# - Inline Assembly (ASM) for performance-critical operations
# - Control Flow (Loops, If/Else, Ternary Operator)
# - Function Calls & Recursion (implied by list traversal)
# - Global Variables & Constants
# - String Manipulation & Printing
# - Imports
# ==================================================================================

import printf, malloc, free, strcpy from "libc";
import exit from "std";

extern malloc(size: u64) ret *u8;

#  Enterprise Structures

struct Task {
    id: u64,
    description: u8[64],
    priority: u8, # 1-5
    next: *Task, # Linked list of tasks
}

struct Employee {
    id: u64,
    name: u8[64],
    salary: u64,
    tasks: *Task, # Head of task list
    next: *Employee, # Linked list of employees
}

# --- Global State ---
global head_employee: *Employee = NULL;
global employee_count: u64 = 0;

# --- ASM Optimized ID Generator ---
frame generate_id() ret u64 {
    local id: u64 = 0;
    # Simulate some "complex" enterprise ID generation
    asm {
        rdrand rax;
        mov [(id)], rax;
    }
    if id < 0 {
        id = -id;
    }
    return id % 10000; # Keep it readable
}

# --- Employee Management ---

frame create_employee(name: *u8, salary: u64) ret *Employee {
    # u64 id (8) + u8[64] name (64) + u64 salary (8) + *Task (8) + *Employee (8) = 96 bytes.
    local emp: *Employee = call malloc(96);

    if emp == NULL {
        call printf("CRITICAL ERROR: Enterprise Out Of Memory!\n");
        call exit(1);
    }

    emp.id = call generate_id();
    call strcpy(emp.name, name);
    emp.salary = salary;
    emp.tasks = NULL;
    emp.next = NULL;

    call printf("[LOG] Created Employee: %s (ID: %d)\n", emp.name, emp.id);
    return emp;
}

frame add_employee(emp: *Employee) {
    if head_employee == NULL {
        head_employee = emp;
    } else {
        local current: *Employee = head_employee;
        loop {
            if current.next == NULL {
                break;
            }
            current = current.next;
        }
        current.next = emp;
    }
    employee_count = employee_count + 1;
}

# --- Task Management ---

frame add_task(emp: *Employee, desc: *u8, priority: u8) {
    # 8 + 64 + 1 + 8 = 81 -> 88 aligned
    local task: *Task = call malloc(88);

    task.id = call generate_id();
    call strcpy(task.description, desc);
    task.priority = priority;
    task.next = emp.tasks; # Prepend to list

    emp.tasks = task;
    call printf("[LOG] Assigned Task '%s' to %s\n", desc, emp.name);
}

# --- Enterprise Logic ---

frame calculate_tax(salary: u64) ret u64 {
    local tax: u64 = 0;
    # Enterprise Tax Logic: 20% flat rate, calculated via ASM for "speed"
    asm {
        mov rax, [(salary)];
        mov rbx, 20;
        mul rbx;      # rax = salary * 20
        mov rbx, 100;
        div rbx;      # rax = (salary * 20) / 100
        mov [(tax)], rax;
    }
    return tax;
}

frame print_payroll_report() {
    call printf("\n=== ENTERPRISE PAYROLL REPORT ===\n");
    local current: *Employee = head_employee;
    local total_payout: u64 = 0;

    loop {
        if current == NULL {
            break;
        }

        local tax: u64 = call calculate_tax(current.salary);
        local net: u64 = current.salary - tax;

        call printf("ID: %d | Name: %s | Gross: $%d | Tax: $%d | ", current.id, current.name, current.salary, tax);
        call printf("Net: $%d | Role: %s\n", net, current.salary > 100000 ? "Executive" : "Staff");

        # Print Tasks
        local t: *Task = current.tasks;
        loop {
            if t == NULL {
                break;
            }
            call printf("  - [Priority %d] Task: %s\n", t.priority, t.description);
            t = t.next;
        }

        total_payout = total_payout + current.salary;
        current = current.next;
    }
    call printf("---------------------------------\n");
    call printf("Total Monthly Burn: $%d\n", total_payout);
    call printf("=================================\n");
}

# --- Main Execution ---

frame main() ret u64 {
    call printf("Initializing Enterprise System v1.0...\n");

    # Hire Employees
    local emp1: *Employee = call create_employee("Alice CEO", 150000);
    call add_employee(emp1);

    local emp2: *Employee = call create_employee("Bob Engineer", 90000);
    call add_employee(emp2);

    local emp3: *Employee = call create_employee("Charlie Intern", 30000);
    call add_employee(emp3);

    # Assign Tasks
    call add_task(emp1, "Maximize Shareholder Value", 1);
    call add_task(emp2, "Fix Critical Bug #404", 5);
    call add_task(emp2, "Refactor Legacy Code", 3);
    call add_task(emp3, "Fetch Coffee", 2);

    # Run Reports
    call print_payroll_report();

    return 0;
}
