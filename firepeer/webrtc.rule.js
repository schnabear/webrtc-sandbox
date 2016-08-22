var rule = {
    "rules": {
        "rooms": {
            "$room": {
                ".read": true,
                ".write": "data.exists() && !newData.exists()", // Allow deletion via parent node
                "answer": {
                    ".write": "!data.exists() && newData.exists()", // Do not allow update
                    ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                },
                "offer": {
                    ".write": "!data.exists() && newData.exists()", // Do not allow update
                    ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                },
                "candidate:answerer": {
                    ".write": "!data.exists() && newData.exists()", // Do not allow update
                    ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                },
                "candidate:offerer": {
                    ".write": "!data.exists() && newData.exists()", // Do not allow update
                    ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                }
            }
        }
    }
};
