extern printf(fmt: string, ...) ret int;
type ID = int;
type Coordinate = float;
type Point3D = Point;
struct Point {
    x: Coordinate,
    y: Coordinate,
    z: Coordinate,
}
frame process_point(p: Point3D, id: ID) {
    printf("Processing Point %d: (%d, %d, %d)\n", id, cast<int>(p.x), cast<int>(p.y), cast<int>(p.z));
}
frame main() ret int {
    local id: ID = 42;
    local p: Point3D = Point { x: 10.5, y: 20.5, z: 30.5 };
    printf("Main: %d (%.2f, %.2f, %.2f)\n", id, p.x, p.y, p.z);
    process_point(p, id);
    # Alias of an alias
    type UserID = ID;
    local uid: UserID = 100;
    printf("User ID: %d\n", uid);
    return 0;
}
