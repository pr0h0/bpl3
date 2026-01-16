struct User {
    id: int,
    username: string,
    password: string,
}

struct Note {
    id: int,
    user_id: int,
    title: string,
    content: string,
}

export [User];
export [Note];
