###
Point struct holds two integer coordinates. x and y.
###
struct Point {
    x: int,
    y: int,
    # this is x
    ### this is y ###
}
#test comment
frame main() {
    local p: Point = Point { x: 10, y: 20 };
    if (p.x > 5) {
        p.x = p.x + 1;
        # test comment
    } else {
        ### test comment ###
        # test comment
        p.y = p.y - 1;
    }
    loop {
        if (p.x > 100) {
            break;
        }
        p.x = p.x * 2;
    }
    return;
}
