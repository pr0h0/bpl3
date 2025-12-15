extern printf(fmt: string, ...);
# Complex data structures example showcasing arrays, structs, and algorithms
struct Student {
    id: int,
    name: string,
    score: float,
    frame new(id: int, name: string, score: float) ret Student {
        local s: Student;
        s.id = id;
        s.name = name;
        s.score = score;
        return s;
    }
    frame print(this: Student) {
        printf("Student %d: %s - Score: %.2f\n", this.id, this.name, this.score);
    }
}
frame find_student_by_id(students: *Student, count: int, id: int) ret *Student {
    local i: int = 0;
    loop (i < count) {
        local current: *Student = students + i;
        if (current.id == id) {
            return current;
        }
        i = i + 1;
    }
    return nullptr;
}
frame calculate_average(students: *Student, count: int) ret float {
    local sum: float = 0.0;
    local i: int = 0;
    loop (i < count) {
        local current: *Student = students + i;
        sum = sum + current.score;
        i = i + 1;
    }
    return sum / cast<float>(count);
}
frame find_highest_score(students: *Student, count: int) ret *Student {
    local highest: *Student = students;
    local i: int = 1;
    loop (i < count) {
        local current: *Student = students + i;
        if (current.score > highest.score) {
            highest = current;
        }
        i = i + 1;
    }
    return highest;
}
frame main() ret int {
    local students: Student[5];
    students[0] = Student.new(1, "Alice", 95.5);
    students[1] = Student.new(2, "Bob", 87.0);
    students[2] = Student.new(3, "Charlie", 92.5);
    students[3] = Student.new(4, "Diana", 88.5);
    students[4] = Student.new(5, "Eve", 91.0);
    printf("=== All Students ===\n");
    local i: int = 0;
    loop (i < 5) {
        students[i].print();
        i = i + 1;
    }
    local avg: float = calculate_average(&students[0], 5);
    printf("\nAverage score: %.2f\n", avg);
    local top_student: *Student = find_highest_score(&students[0], 5);
    printf("\nTop student:\n");
    top_student.print();
    local found: *Student = find_student_by_id(&students[0], 5, 3);
    if (found != nullptr) {
        printf("\nFound student with ID 3:\n");
        found.print();
    }
    return 0;
}
