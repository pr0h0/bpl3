import printf;

struct Vector3 {
    x: u64,
    y: u64,
    z: u64
}

# Feature 1: Pass by Value
# This function receives a copy of v. Modifications here do NOT affect the caller.
frame modifyVector(v: Vector3) {
    call printf("  [Inside modifyVector] Received: (%d, %d, %d)\n", v.x, v.y, v.z);
    v.x = 999;
    v.y = 999;
    v.z = 999;
    call printf("  [Inside modifyVector] Modified local copy to: (%d, %d, %d)\n", v.x, v.y, v.z);
}

# Feature 2: Return by Value
# This function creates a local struct and returns it by value.
frame createVector(x: u64, y: u64, z: u64) ret Vector3 {
    local v: Vector3;
    v.x = x;
    v.y = y;
    v.z = z;
    call printf("  [Inside createVector] Created: (%d, %d, %d)\n", v.x, v.y, v.z);
    return v;
}

frame main() ret u8 {
    call printf("=== DEMO: Struct Pass-by-Value and Return-by-Value ===\n\n");

    # 1. Demonstrate Pass by Value
    call printf("1. Testing Pass by Value:\n");
    local myVec: Vector3;
    myVec.x = 10;
    myVec.y = 20;
    myVec.z = 30;
    
    call printf("  [Main] Original before call: (%d, %d, %d)\n", myVec.x, myVec.y, myVec.z);
    call modifyVector(myVec);
    call printf("  [Main] Original after call: (%d, %d, %d) (Should be unchanged)\n", myVec.x, myVec.y, myVec.z);
    
    call printf("\n");

    # 2. Demonstrate Return by Value
    call printf("2. Testing Return by Value:\n");
    local newVec: Vector3 = call createVector(100, 200, 300);
    call printf("  [Main] Received from function: (%d, %d, %d)\n", newVec.x, newVec.y, newVec.z);

    return 0;
}
