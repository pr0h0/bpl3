type Row = int[2];
type Rows<T> = T[];

frame cell(rows: Rows<Row>, i: int, j: int) ret int {
    return rows[i][j];
}

frame main() ret int {
    local grid: Row[3];
    grid[2][1] = 42;
    local view: Row[] = grid;
    view[0][0] = 7;
    if (grid[0][0] != 7) return 1;
    return cell(view, 2, 1) - 42;
}
