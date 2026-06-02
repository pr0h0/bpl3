# ============================================================================
# Task Management System - Comprehensive BPL3 Feature Showcase (1000+ lines)
# ============================================================================
# This example demonstrates:
# - Enums with associated data (tuple variants)
# - Struct methods and operator overloading
# - Function overloading (multiple signatures)
# - Pattern matching with exhaustiveness checking
# - Complex business logic with permissions
# - Loops, conditionals, and control flow
# ============================================================================

import [printf] from "std/c.bpl";

# ============================================================================
# ENUMS - Representing different types of state and data
# ============================================================================

enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

enum TaskStatus {
    NotStarted,
    InProgress(int),
    # Progress percentage (0-100)
    Blocked(int),
    # Reason code for being blocked
    Completed,
    Cancelled(int),
    # Cancellation reason code
}

enum UserRole {
    Guest,
    User,
    Manager,
    Admin,
}

enum Permission {
    Read,
    Write,
    Delete,
    Assign,
    Complete,
}

enum TaskCategory {
    Bug,
    Feature,
    Documentation,
    Testing,
    Deployment,
    Maintenance,
}

enum NotificationType {
    Info(int),
    Warning(int),
    Error(int),
    Success(int),
}

enum FilterCriteria {
    ByPriority(Priority),
    ByCategory(TaskCategory),
    ByAssignee(int),
    All,
}

# ============================================================================
# STRUCTS WITH OPERATOR OVERLOADING AND METHODS
# ============================================================================

# Date structure with comparison operators
struct Date {
    year: int,
    month: int,
    day: int,
    # Constructor
    frame new(y: int, m: int, d: int) ret Date {
        local result: Date;
        result.year = y;
        result.month = m;
        result.day = d;
        return result;
    }

    # Convert date to days since epoch (simplified)
    frame toDays(this: *Date) ret int {
        return (this.year * 365) + (this.month * 30) + this.day;
    }

    # Operator overload: equality (==)
    frame __eq__(this: *Date, other: *Date) ret bool {
        return (this.year == other.year) && (this.month == other.month) && (this.day == other.day);
    }

    # Operator overload: less than (<)
    frame __lt__(this: *Date, other: *Date) ret bool {
        local this_days: int = this.toDays();
        local other_days: int = other.toDays();
        return this_days < other_days;
    }

    # Operator overload: greater than (>)
    frame __gt__(this: *Date, other: *Date) ret bool {
        local this_days: int = this.toDays();
        local other_days: int = other.toDays();
        return this_days > other_days;
    }

    # Check if date is valid
    frame isValid(this: *Date) ret bool {
        if ((this.month < 1) || (this.month > 12)) {
            return false;
        }
        if ((this.day < 1) || (this.day > 31)) {
            return false;
        }
        return true;
    }
}

# Time structure with arithmetic operators
struct Time {
    hours: int,
    minutes: int,
    frame new(h: int, m: int) ret Time {
        local result: Time;
        result.hours = h;
        result.minutes = m;
        return result;
    }

    # Convert to minutes
    frame toMinutes(this: *Time) ret int {
        return (this.hours * 60) + this.minutes;
    }

    # Operator overload: addition (+)
    frame __add__(this: *Time, other: *Time) ret Time {
        local total_minutes: int = this.toMinutes() + other.toMinutes();
        local result: Time;
        result.hours = total_minutes / 60;
        result.minutes = total_minutes % 60;
        return result;
    }

    # Operator overload: subtraction (-)
    frame __sub__(this: *Time, other: *Time) ret Time {
        local diff_minutes: int = this.toMinutes() - other.toMinutes();
        local result: Time;
        result.hours = diff_minutes / 60;
        result.minutes = diff_minutes % 60;
        return result;
    }
}

# Task structure - main entity
struct Task {
    id: int,
    priority: Priority,
    status: TaskStatus,
    category: TaskCategory,
    assignee_id: int,
    created_year: int,
    created_month: int,
    created_day: int,
    due_year: int,
    due_month: int,
    due_day: int,
    estimated_hours: int,
    # Constructor
    frame new(task_id: int, prio: Priority) ret Task {
        local task: Task;
        task.id = task_id;
        task.priority = prio;
        task.status = TaskStatus.NotStarted;
        task.category = TaskCategory.Feature;
        task.assignee_id = 0;
        task.created_year = 2025;
        task.created_month = 1;
        task.created_day = 1;
        task.due_year = 2025;
        task.due_month = 12;
        task.due_day = 31;
        task.estimated_hours = 8;
        return task;
    }

    # Get priority score for sorting
    frame getPriorityScore(this: *Task) ret int {
        return match (this.priority) {
            Priority.Critical => 1000,
            Priority.High => 100,
            Priority.Medium => 10,
            Priority.Low => 1,
        };
    }

    # Check if task can be completed
    frame canComplete(this: *Task) ret bool {
        return match (this.status) {
            TaskStatus.InProgress(pct) => true,
            TaskStatus.NotStarted => false,
            TaskStatus.Blocked(reason) => false,
            TaskStatus.Completed => false,
            TaskStatus.Cancelled(reason) => false,
        };
    }

    # Update task progress
    frame updateProgress(this: *Task, percent: int) {
        this.status = TaskStatus.InProgress(percent);
    }

    # Operator overload: comparison by priority (>)
    frame __gt__(this: *Task, other: *Task) ret bool {
        return this.getPriorityScore() > other.getPriorityScore();
    }

    # Operator overload: comparison by priority (<)
    frame __lt__(this: *Task, other: *Task) ret bool {
        return this.getPriorityScore() < other.getPriorityScore();
    }

    # Operator overload: equality by ID (==)
    frame __eq__(this: *Task, other: *Task) ret bool {
        return this.id == other.id;
    }

    # Check if task is overdue
    frame isOverdue(this: *Task, current_year: int, current_month: int, current_day: int) ret bool {
        local is_complete: bool = match (this.status) {
            TaskStatus.Completed => true,
            TaskStatus.Cancelled(reason) => true,
            _ => false,
        };

        if (is_complete) {
            return false;
        }
        local due_days: int = (this.due_year * 365) + (this.due_month * 30) + this.due_day;
        local current_days: int = (current_year * 365) + (current_month * 30) + current_day;
        return current_days > due_days;
    }
}

# User structure with permission system
struct User {
    id: int,
    role: UserRole,
    active: bool,
    frame new(user_id: int, user_role: UserRole) ret User {
        local user: User;
        user.id = user_id;
        user.role = user_role;
        user.active = true;
        return user;
    }

    # Check if user has permission
    frame hasPermission(this: *User, perm: Permission) ret bool {
        local role_level: int = match (this.role) {
            UserRole.Admin => 4,
            UserRole.Manager => 3,
            UserRole.User => 2,
            UserRole.Guest => 1,
        };

        local required_level: int = match (perm) {
            Permission.Read => 1,
            Permission.Write => 2,
            Permission.Assign => 3,
            Permission.Complete => 2,
            Permission.Delete => 4,
        };

        return (role_level >= required_level) && this.active;
    }

    frame canAssign(this: *User) ret bool {
        return this.hasPermission(Permission.Assign);
    }

    frame canDelete(this: *User) ret bool {
        return this.hasPermission(Permission.Delete);
    }
}

# Statistics structure with arithmetic operators
struct TaskStats {
    total_tasks: int,
    completed: int,
    in_progress: int,
    blocked: int,
    not_started: int,
    frame new() ret TaskStats {
        local stats: TaskStats;
        stats.total_tasks = 0;
        stats.completed = 0;
        stats.in_progress = 0;
        stats.blocked = 0;
        stats.not_started = 0;
        return stats;
    }

    # Calculate completion percentage
    frame completionRate(this: *TaskStats) ret int {
        if (this.total_tasks == 0) {
            return 0;
        }
        return (this.completed * 100) / this.total_tasks;
    }

    # Operator overload: addition (+)
    frame __add__(this: *TaskStats, other: *TaskStats) ret TaskStats {
        local result: TaskStats;
        result.total_tasks = this.total_tasks + other.total_tasks;
        result.completed = this.completed + other.completed;
        result.in_progress = this.in_progress + other.in_progress;
        result.blocked = this.blocked + other.blocked;
        result.not_started = this.not_started + other.not_started;
        return result;
    }
}

# Task list structure (simplified array with up to 5 tasks)
struct TaskList {
    count: int,
    task1: Task,
    task2: Task,
    task3: Task,
    task4: Task,
    task5: Task,
    frame new() ret TaskList {
        local list: TaskList;
        list.count = 0;
        return list;
    }

    # Add task to list
    frame add(this: *TaskList, task: Task) {
        if (this.count == 0) {
            this.task1 = task;
            this.count = 1;
            return;
        }
        if (this.count == 1) {
            this.task2 = task;
            this.count = 2;
            return;
        }
        if (this.count == 2) {
            this.task3 = task;
            this.count = 3;
            return;
        }
        if (this.count == 3) {
            this.task4 = task;
            this.count = 4;
            return;
        }
        if (this.count == 4) {
            this.task5 = task;
            this.count = 5;
            return;
        }
    }

    # Get task by index
    frame get(this: *TaskList, index: int) ret *Task {
        if (index == 0) {
            return &this.task1;
        }
        if (index == 1) {
            return &this.task2;
        }
        if (index == 2) {
            return &this.task3;
        }
        if (index == 3) {
            return &this.task4;
        }
        if (index == 4) {
            return &this.task5;
        }
        # fallback
        return &this.task1;
    }

    # Count tasks by priority
    frame countByPriority(this: *TaskList, prio: Priority) ret int {
        local count: int = 0;
        local i: int = 0;
        loop (i < this.count) {
            local task_ptr: *Task = this.get(i);
            if (prioritiesMatch(task_ptr.priority, prio)) {
                count = count + 1;
            }
            i = i + 1;
        }
        return count;
    }
}

# ============================================================================
# HELPER FUNCTIONS FOR ENUM COMPARISON
# ============================================================================

# Helper: Check if priorities match
frame prioritiesMatch(task_prio: Priority, filter_prio: Priority) ret bool {
    local task_code: int = format(task_prio);
    local filter_code: int = format(filter_prio);
    return task_code == filter_code;
}

# Helper: Check if categories match
frame categoriesMatch(task_cat: TaskCategory, filter_cat: TaskCategory) ret bool {
    local task_code: int = match (task_cat) {
        TaskCategory.Bug => 0,
        TaskCategory.Feature => 1,
        TaskCategory.Documentation => 2,
        TaskCategory.Testing => 3,
        TaskCategory.Deployment => 4,
        TaskCategory.Maintenance => 5,
    };
    local filter_code: int = match (filter_cat) {
        TaskCategory.Bug => 0,
        TaskCategory.Feature => 1,
        TaskCategory.Documentation => 2,
        TaskCategory.Testing => 3,
        TaskCategory.Deployment => 4,
        TaskCategory.Maintenance => 5,
    };
    return task_code == filter_code;
}

# ============================================================================
# FUNCTION OVERLOADING - Multiple signatures for different use cases
# ============================================================================

# Overload 1: Calculate priority score from Priority enum
frame calculateScore(prio: Priority) ret int {
    return match (prio) {
        Priority.Critical => 1000,
        Priority.High => 100,
        Priority.Medium => 10,
        Priority.Low => 1,
    };
}

# Overload 2: Calculate priority score from Task
frame calculateScore(task: *Task) ret int {
    local base_score: int = task.getPriorityScore();
    local status_multiplier: int = match (task.status) {
        TaskStatus.Blocked(reason) => 2,
        TaskStatus.InProgress(pct) => 1,
        TaskStatus.NotStarted => 1,
        TaskStatus.Completed => 1,
        TaskStatus.Cancelled(reason) => 1,
    };
    return base_score * status_multiplier;
}

# Overload 3: Validate date
frame validate(date: *Date) ret bool {
    return date.isValid();
}

# Overload 4: Validate task
frame validate(task: *Task) ret bool {
    return (task.id > 0) && (task.estimated_hours > 0);
}

# Overload 5: Compare dates
frame compare(d1: *Date, d2: *Date) ret int {
    if (d1 < d2) {
        return -1;
    }
    if (d1 > d2) {
        return 1;
    }
    return 0;
}

# Overload 6: Compare tasks by priority
frame compare(t1: *Task, t2: *Task) ret int {
    if (t1 > t2) {
        return 1;
    }
    if (t1 < t2) {
        return -1;
    }
    return 0;
}

# Overload 7: Format priority as code
frame format(prio: Priority) ret int {
    return match (prio) {
        Priority.Low => 0,
        Priority.Medium => 1,
        Priority.High => 2,
        Priority.Critical => 3,
    };
}

# Overload 8: Format date as number (YYYYMMDD)
frame format(date: *Date) ret int {
    return (date.year * 10000) + (date.month * 100) + date.day;
}

# Overload 9: Create notification code from NotificationType
frame createNotification(ntype: NotificationType) ret int {
    return match (ntype) {
        NotificationType.Info(code) => code,
        NotificationType.Warning(code) => code,
        NotificationType.Error(code) => code,
        NotificationType.Success(code) => code,
    };
}

# Overload 10: Create notification from priority
frame createNotification(prio: Priority) ret int {
    return match (prio) {
        Priority.Low => 1,
        Priority.Medium => 2,
        Priority.High => 3,
        Priority.Critical => 4,
    };
}

# ============================================================================
# UTILITY FUNCTIONS WITH PATTERN MATCHING
# ============================================================================

# Get role level for permission checks
frame getRoleLevel(role: UserRole) ret int {
    return match (role) {
        UserRole.Guest => 1,
        UserRole.User => 2,
        UserRole.Manager => 3,
        UserRole.Admin => 4,
    };
}

# Check if status is terminal (completed or cancelled)
frame isTerminalStatus(status: TaskStatus) ret bool {
    return match (status) {
        TaskStatus.Completed => true,
        TaskStatus.Cancelled(reason) => true,
        _ => false,
    };
}

# Get status code for reporting
frame getStatusCode(status: TaskStatus) ret int {
    return match (status) {
        TaskStatus.NotStarted => 0,
        TaskStatus.InProgress(pct) => pct,
        TaskStatus.Blocked(reason) => -1,
        TaskStatus.Completed => 100,
        TaskStatus.Cancelled(reason) => -2,
    };
    # Pattern destructuring works!
}

# Check if task matches filter criteria
frame matchesFilter(task: *Task, criteria: FilterCriteria) ret bool {
    return match (criteria) {
        FilterCriteria.All => true,
        FilterCriteria.ByAssignee(user_id) => task.assignee_id == user_id,
        FilterCriteria.ByPriority(prio) => prioritiesMatch(task.priority, prio),
        FilterCriteria.ByCategory(cat) => categoriesMatch(task.category, cat),
    };
}

# Calculate task statistics from list
frame calculateStatistics(list: *TaskList) ret TaskStats {
    local stats: TaskStats = TaskStats.new();
    stats.total_tasks = list.count;

    local i: int = 0;
    loop (i < list.count) {
        local task_ptr: *Task = list.get(i);
        local status_type: int = match (task_ptr.status) {
            TaskStatus.NotStarted => 0,
            TaskStatus.InProgress(pct) => 1,
            TaskStatus.Blocked(reason) => 2,
            TaskStatus.Completed => 3,
            TaskStatus.Cancelled(reason) => 4,
        };

        if (status_type == 0) {
            stats.not_started = stats.not_started + 1;
        }
        if (status_type == 1) {
            stats.in_progress = stats.in_progress + 1;
        }
        if (status_type == 2) {
            stats.blocked = stats.blocked + 1;
        }
        if (status_type == 3) {
            stats.completed = stats.completed + 1;
        }
        i = i + 1;
    }

    return stats;
}

# Get priority weight for sorting
frame getPriorityWeight(prio: Priority) ret int {
    return calculateScore(prio);
}

# Check if user can perform action on task
frame canPerformAction(user: *User, task: *Task, perm: Permission) ret bool {
    if (!user.active) {
        return false;
    }
    # Admins can do anything
    local is_admin: bool = match (user.role) {
        UserRole.Admin => true,
        _ => false,
    };

    if (is_admin) {
        return true;
    }
    # Check general permission
    if (!user.hasPermission(perm)) {
        return false;
    }
    # Additional checks for specific permissions
    return match (perm) {
        Permission.Complete => (task.assignee_id == user.id) || user.canAssign(),
        Permission.Delete => user.canDelete(),
        Permission.Assign => user.canAssign(),
        Permission.Read => true,
        Permission.Write => true,
    };
}

# Calculate urgency score combining priority and due date
frame calculateUrgency(task: *Task, current_year: int, current_month: int, current_day: int) ret int {
    local priority_score: int = task.getPriorityScore();
    local due_days: int = (task.due_year * 365) + (task.due_month * 30) + task.due_day;
    local current_days: int = (current_year * 365) + (current_month * 30) + current_day;
    local days_until_due: int = due_days - current_days;

    # More urgent if closer to due date
    local urgency: int = priority_score;
    if (days_until_due < 0) {
        # Overdue - highest urgency
        urgency = urgency * 10;
    }
    if ((days_until_due >= 0) && (days_until_due < 7)) {
        # Due within a week - high urgency
        urgency = urgency * 5;
    }
    if ((days_until_due >= 7) && (days_until_due < 30)) {
        # Due within a month - medium urgency
        urgency = urgency * 2;
    }
    return urgency;
}

# Process notification and return action code multiplied by base
frame processNotification(notif: NotificationType) ret int {
    return match (notif) {
        NotificationType.Info(code) => code * 1,
        NotificationType.Warning(code) => code * 2,
        NotificationType.Error(code) => code * 3,
        NotificationType.Success(code) => code * 4,
    };
}

# ============================================================================
# COMPLEX BUSINESS LOGIC FUNCTIONS
# ============================================================================

# Assign task to user with validation
frame assignTask(task: *Task, user: *User, assigner: *User) {
    # Check if assigner has permission
    if (!canPerformAction(assigner, task, Permission.Assign)) {
        return;
    }
    # Check if user is active
    if (!user.active) {
        return;
    }
    # Assign the task
    task.assignee_id = user.id;
    task.status = TaskStatus.InProgress(0);
}

# Complete a task with validation
frame completeTask(task: *Task, user: *User) ret bool {
    # Check permission
    if (!canPerformAction(user, task, Permission.Complete)) {
        return false;
    }
    # Check if task can be completed
    if (!task.canComplete()) {
        return false;
    }
    # Complete the task
    task.status = TaskStatus.Completed;
    return true;
}

# Block a task with reason code
frame blockTask(task: *Task, reason_code: int, user: *User) ret bool {
    if (!canPerformAction(user, task, Permission.Write)) {
        return false;
    }
    task.status = TaskStatus.Blocked(reason_code);
    return true;
}

# Calculate team statistics from multiple task lists
frame aggregateStats(list1: *TaskList, list2: *TaskList) ret TaskStats {
    local stats1: TaskStats = calculateStatistics(list1);
    local stats2: TaskStats = calculateStatistics(list2);
    return &stats1 + &stats2;
}

# Filter tasks by criteria and count matches
frame countFilteredTasks(list: *TaskList, criteria: FilterCriteria) ret int {
    local count: int = 0;
    local i: int = 0;
    loop (i < list.count) {
        local task_ptr: *Task = list.get(i);
        if (matchesFilter(task_ptr, criteria)) {
            count = count + 1;
        }
        i = i + 1;
    }
    return count;
}

# Find highest priority task in list
frame findHighestPriority(list: *TaskList) ret *Task {
    if (list.count == 0) {
        return list.get(0); # fallback
    }
    local highest: *Task = list.get(0);
    local i: int = 1;
    loop (i < list.count) {
        local current: *Task = list.get(i);
        if (current > highest) {
            highest = current;
        }
        i = i + 1;
    }
    return highest;
}

# Calculate total estimated hours for task list
frame calculateTotalHours(list: *TaskList) ret int {
    local total: int = 0;
    local i: int = 0;
    loop (i < list.count) {
        local task_ptr: *Task = list.get(i);
        total = total + task_ptr.estimated_hours;
        i = i + 1;
    }
    return total;
}

# Check if any task in list is overdue
frame hasOverdueTasks(list: *TaskList, year: int, month: int, day: int) ret bool {
    local i: int = 0;
    loop (i < list.count) {
        local task_ptr: *Task = list.get(i);
        if (task_ptr.isOverdue(year, month, day)) {
            return true;
        }
        i = i + 1;
    }
    return false;
}

# Get count of tasks by category
frame countByCategory(list: *TaskList, cat: TaskCategory) ret int {
    local count: int = 0;
    local i: int = 0;
    loop (i < list.count) {
        local task_ptr: *Task = list.get(i);
        if (categoriesMatch(task_ptr.category, cat)) {
            count = count + 1;
        }
        i = i + 1;
    }
    return count;
}

# Calculate category distribution scores
frame calculateCategoryScores(list: *TaskList) ret int {
    local bugs: int = countByCategory(list, TaskCategory.Bug);
    local features: int = countByCategory(list, TaskCategory.Feature);
    local docs: int = countByCategory(list, TaskCategory.Documentation);
    local tests: int = countByCategory(list, TaskCategory.Testing);
    local deploys: int = countByCategory(list, TaskCategory.Deployment);
    local maint: int = countByCategory(list, TaskCategory.Maintenance);

    return (bugs * 100) + (features * 10) + (docs * 1) + (tests * 5) + (deploys * 20) + (maint * 3);
}

# ============================================================================
# MAIN FUNCTION - Comprehensive demonstration
# ============================================================================

frame main() ret int {
    printf("=== Task Management System Demo ===\n\n");

    # Create dates using struct methods
    local today: Date = Date.new(2025, 12, 18);
    local tomorrow: Date = Date.new(2025, 12, 19);
    local next_week: Date = Date.new(2025, 12, 25);

    printf("Today: %d-%d-%d\n", today.year, today.month, today.day);
    printf("Is today valid? %d\n", validate(&today));

    # Demonstrate date comparison operators
    if (&today < &tomorrow) {
        printf("Today is before tomorrow (correct)\n");
    }
    if (&next_week > &today) {
        printf("Next week is after today (correct)\n");
    }
    # Create time objects and demonstrate arithmetic
    local morning: Time = Time.new(9, 30);
    local afternoon: Time = Time.new(14, 45);
    local duration: Time = &afternoon - &morning;
    printf("\nTime difference: %d hours %d minutes\n", duration.hours, duration.minutes);

    # Create users with different roles
    local admin: User = User.new(1, UserRole.Admin);
    local manager: User = User.new(2, UserRole.Manager);
    local developer: User = User.new(3, UserRole.User);
    local guest: User = User.new(4, UserRole.Guest);

    printf("\n=== User Permissions ===\n");
    printf("Admin can assign: %d\n", admin.canAssign());
    printf("Manager can assign: %d\n", manager.canAssign());
    printf("Developer can assign: %d\n", developer.canAssign());
    printf("Guest can assign: %d\n", guest.canAssign());

    printf("Admin can delete: %d\n", admin.canDelete());
    printf("Manager can delete: %d\n", manager.canDelete());
    printf("Developer can delete: %d\n", developer.canDelete());

    # Create tasks with different priorities and statuses
    local task1: Task = Task.new(101, Priority.Critical);
    task1.category = TaskCategory.Bug;
    task1.due_year = 2025;
    task1.due_month = 12;
    task1.due_day = 18;
    task1.estimated_hours = 4;
    task1.status = TaskStatus.InProgress(75);

    local task2: Task = Task.new(102, Priority.High);
    task2.category = TaskCategory.Feature;
    task2.due_year = 2025;
    task2.due_month = 12;
    task2.due_day = 25;
    task2.estimated_hours = 16;
    task2.status = TaskStatus.NotStarted;

    local task3: Task = Task.new(103, Priority.Medium);
    task3.category = TaskCategory.Documentation;
    task3.due_year = 2025;
    task3.due_month = 12;
    task3.due_day = 25;
    task3.estimated_hours = 8;
    task3.status = TaskStatus.InProgress(50);

    local task4: Task = Task.new(104, Priority.Low);
    task4.category = TaskCategory.Testing;
    task4.due_year = 2025;
    task4.due_month = 12;
    task4.due_day = 31;
    task4.estimated_hours = 12;
    task4.status = TaskStatus.Blocked(404);

    local task5: Task = Task.new(105, Priority.Critical);
    task5.category = TaskCategory.Deployment;
    task5.due_year = 2025;
    task5.due_month = 12;
    task5.due_day = 19;
    task5.estimated_hours = 2;
    task5.status = TaskStatus.Completed;

    printf("\n=== Task Priority Comparison (Operator Overloading) ===\n");
    if (&task1 > &task2) {
        printf("Task %d has higher priority than Task %d\n", task1.id, task2.id);
    }
    if (&task4 < &task1) {
        printf("Task %d has lower priority than Task %d\n", task4.id, task1.id);
    }
    # Demonstrate function overloading
    printf("\n=== Function Overloading ===\n");
    printf("Priority score (enum): %d\n", calculateScore(Priority.Critical));
    printf("Priority score (task1): %d\n", calculateScore(&task1));
    printf("Priority score (task4): %d\n", calculateScore(&task4));

    printf("Date comparison: %d\n", compare(&today, &tomorrow));
    printf("Task comparison: %d\n", compare(&task1, &task2));

    printf("Format priority: %d\n", format(Priority.High));
    printf("Format date: %d\n", format(&today));

    printf("Create notification (enum): %d\n", createNotification(Priority.Critical));
    printf("Create notification (type): %d\n", createNotification(NotificationType.Error(42)));

    # Pattern matching on enum variants
    printf("\n=== Pattern Matching on Enums ===\n");

    local status_msg: int = match (task1.status) {
        TaskStatus.NotStarted => 0,
        TaskStatus.InProgress(pct) => pct,
        TaskStatus.Blocked(reason) => -1,
        TaskStatus.Completed => 100,
        TaskStatus.Cancelled(reason) => -2,
    };
    # Pattern destructuring now works!

    printf("Task1 progress: %d%%\n", status_msg);

    local status_msg4: int = match (task4.status) {
        TaskStatus.NotStarted => 0,
        TaskStatus.InProgress(pct) => 50,
        TaskStatus.Blocked(reason) => reason,
        TaskStatus.Completed => 100,
        TaskStatus.Cancelled(reason) => -2,
    };
    # Pattern destructuring now works!

    printf("Task4 block reason code: %d\n", status_msg4);

    # Check task validity
    printf("\n=== Task Validation ===\n");
    printf("Task1 valid: %d\n", validate(&task1));
    printf("Task2 valid: %d\n", validate(&task2));

    # Check if tasks are overdue
    printf("\n=== Overdue Check ===\n");
    printf("Task1 overdue: %d\n", task1.isOverdue(2025, 12, 18));
    printf("Task2 overdue: %d\n", task2.isOverdue(2025, 12, 18));
    printf("Task5 overdue: %d\n", task5.isOverdue(2025, 12, 18));

    # Calculate urgency scores
    printf("\n=== Urgency Scores ===\n");
    printf("Task1 urgency: %d\n", calculateUrgency(&task1, 2025, 12, 18));
    printf("Task2 urgency: %d\n", calculateUrgency(&task2, 2025, 12, 18));
    printf("Task3 urgency: %d\n", calculateUrgency(&task3, 2025, 12, 18));

    # Build task list
    local task_list: TaskList = TaskList.new();
    task_list.add(task1);
    task_list.add(task2);
    task_list.add(task3);
    task_list.add(task4);
    task_list.add(task5);

    printf("\n=== Task List Operations ===\n");
    printf("Total tasks in list: %d\n", task_list.count);

    # Count by priority
    local critical_count: int = task_list.countByPriority(Priority.Critical);
    local high_count: int = task_list.countByPriority(Priority.High);
    local medium_count: int = task_list.countByPriority(Priority.Medium);
    local low_count: int = task_list.countByPriority(Priority.Low);

    printf("Critical priority tasks: %d\n", critical_count);
    printf("High priority tasks: %d\n", high_count);
    printf("Medium priority tasks: %d\n", medium_count);
    printf("Low priority tasks: %d\n", low_count);

    # Demonstrate permission-based actions
    printf("\n=== Permission-Based Actions ===\n");

    # Try to assign task1 to developer (as manager)
    assignTask(&task1, &developer, &manager);
    printf("Task1 assigned to user %d\n", task1.assignee_id);

    # Try to complete task (as assigned user)
    local completed: bool = completeTask(&task3, &developer);
    printf("Task3 completion attempt: %d\n", completed);

    # Try to block a task
    local blocked: bool = blockTask(&task2, 500, &manager);
    printf("Task2 blocked: %d\n", blocked);

    # Test notification system
    printf("\n=== Notification System ===\n");
    local notif1: NotificationType = NotificationType.Info(1);
    local notif2: NotificationType = NotificationType.Warning(2);
    local notif3: NotificationType = NotificationType.Error(3);
    local notif4: NotificationType = NotificationType.Success(4);

    printf("Info notification code: %d\n", processNotification(notif1));
    printf("Warning notification code: %d\n", processNotification(notif2));
    printf("Error notification code: %d\n", processNotification(notif3));
    printf("Success notification code: %d\n", processNotification(notif4));

    # Demonstrate filter criteria matching
    printf("\n=== Filter Criteria ===\n");
    local filter_critical: FilterCriteria = FilterCriteria.ByPriority(Priority.Critical);
    local filter_bugs: FilterCriteria = FilterCriteria.ByCategory(TaskCategory.Bug);

    printf("Task1 matches critical filter: %d\n", matchesFilter(&task1, filter_critical));
    printf("Task2 matches critical filter: %d\n", matchesFilter(&task2, filter_critical));
    printf("Task1 matches bug filter: %d\n", matchesFilter(&task1, filter_bugs));
    printf("Task2 matches bug filter: %d\n", matchesFilter(&task2, filter_bugs));

    local critical_filtered: int = countFilteredTasks(&task_list, filter_critical);
    local bug_filtered: int = countFilteredTasks(&task_list, filter_bugs);
    printf("Total critical tasks: %d\n", critical_filtered);
    printf("Total bug tasks: %d\n", bug_filtered);

    # Calculate role levels
    printf("\n=== Role Levels ===\n");
    printf("Admin level: %d\n", getRoleLevel(admin.role));
    printf("Manager level: %d\n", getRoleLevel(manager.role));
    printf("User level: %d\n", getRoleLevel(developer.role));
    printf("Guest level: %d\n", getRoleLevel(guest.role));

    # Test wildcard pattern matching
    printf("\n=== Wildcard Pattern Matching ===\n");
    local simple_check: int = match (task5.status) {
        TaskStatus.Completed => 1,
        _ => 0,
    };
    printf("Task5 is completed: %d\n", simple_check);

    # Multiple priority checks
    printf("\n=== Priority Distribution ===\n");
    printf("Critical priority weight: %d\n", getPriorityWeight(Priority.Critical));
    printf("High priority weight: %d\n", getPriorityWeight(Priority.High));
    printf("Medium priority weight: %d\n", getPriorityWeight(Priority.Medium));
    printf("Low priority weight: %d\n", getPriorityWeight(Priority.Low));

    # Calculate statistics
    printf("\n=== Task Statistics ===\n");
    local stats: TaskStats = calculateStatistics(&task_list);
    printf("Total tasks: %d\n", stats.total_tasks);
    printf("Completed: %d\n", stats.completed);
    printf("In progress: %d\n", stats.in_progress);
    printf("Blocked: %d\n", stats.blocked);
    printf("Not started: %d\n", stats.not_started);
    printf("Completion rate: %d%%\n", stats.completionRate());

    # Find highest priority task
    local highest: *Task = findHighestPriority(&task_list);
    printf("\n=== Highest Priority Task ===\n");
    printf("Task ID: %d\n", highest.id);
    printf("Priority code: %d\n", format(highest.priority));

    # Calculate total hours
    local total_hours: int = calculateTotalHours(&task_list);
    printf("\n=== Time Estimates ===\n");
    printf("Total estimated hours: %d\n", total_hours);
    printf("Average hours per task: %d\n", total_hours / task_list.count);

    # Check for overdue tasks
    local has_overdue: bool = hasOverdueTasks(&task_list, 2025, 12, 18);
    printf("Has overdue tasks: %d\n", has_overdue);

    # Category distribution
    printf("\n=== Category Distribution ===\n");
    local bug_count: int = countByCategory(&task_list, TaskCategory.Bug);
    local feature_count: int = countByCategory(&task_list, TaskCategory.Feature);
    local doc_count: int = countByCategory(&task_list, TaskCategory.Documentation);
    local test_count: int = countByCategory(&task_list, TaskCategory.Testing);
    local deploy_count: int = countByCategory(&task_list, TaskCategory.Deployment);
    local maint_count: int = countByCategory(&task_list, TaskCategory.Maintenance);

    printf("Bugs: %d\n", bug_count);
    printf("Features: %d\n", feature_count);
    printf("Documentation: %d\n", doc_count);
    printf("Testing: %d\n", test_count);
    printf("Deployment: %d\n", deploy_count);
    printf("Maintenance: %d\n", maint_count);

    local category_score: int = calculateCategoryScores(&task_list);
    printf("Category distribution score: %d\n", category_score);

    # Test terminal status checking
    printf("\n=== Terminal Status Checks ===\n");
    printf("Task1 terminal: %d\n", isTerminalStatus(task1.status));
    printf("Task5 terminal: %d\n", isTerminalStatus(task5.status));

    # Get status codes
    printf("\n=== Status Codes ===\n");
    printf("Task1 status code: %d\n", getStatusCode(task1.status));
    printf("Task2 status code: %d\n", getStatusCode(task2.status));
    printf("Task3 status code: %d\n", getStatusCode(task3.status));
    printf("Task4 status code: %d\n", getStatusCode(task4.status));
    printf("Task5 status code: %d\n", getStatusCode(task5.status));

    # Create second list for aggregation test
    local task_list2: TaskList = TaskList.new();
    local task6: Task = Task.new(106, Priority.High);
    task6.status = TaskStatus.Completed;
    task_list2.add(task6);

    local task7: Task = Task.new(107, Priority.Medium);
    task7.status = TaskStatus.InProgress(30);
    task_list2.add(task7);

    # Aggregate statistics
    printf("\n=== Aggregated Statistics ===\n");
    local agg_stats: TaskStats = aggregateStats(&task_list, &task_list2);
    printf("Combined total tasks: %d\n", agg_stats.total_tasks);
    printf("Combined completed: %d\n", agg_stats.completed);
    printf("Combined completion rate: %d%%\n", agg_stats.completionRate());

    # Final summary
    printf("\n=== Final Summary ===\n");
    printf("Total unique task IDs: %d\n", task1.id + task2.id + task3.id + task4.id + task5.id + task6.id + task7.id);
    printf("System processed %d tasks successfully\n", agg_stats.total_tasks);

    printf("\n=== Demo Complete ===\n");
    printf("All features demonstrated:\n");
    printf("- Enums with tuple variants\n");
    printf("- Operator overloading\n");
    printf("- Function overloading\n");
    printf("- Pattern matching\n");
    printf("- Complex business logic\n");

    return 0;
}
