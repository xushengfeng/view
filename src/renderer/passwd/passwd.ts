function new_passwd(
    length: number,
    includeUpperCase: boolean,
    includeLowerCase: boolean,
    includeSpecialChars: boolean,
    includeNumber: boolean,
    excludedChars: string[]
): string {
    let chars = "";

    const upperCaseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowerCaseLetters = "abcdefghijklmnopqrstuvwxyz";
    const specialChars = "`~!@#$%^&*()-_=+[{]}\\|;:'\",<.>/?";
    const number = "0123456789";

    // 添加大写字母
    if (includeUpperCase) {
        chars += upperCaseLetters;
    }

    // 添加小写字母
    if (includeLowerCase) {
        chars += lowerCaseLetters;
    }

    // 添加特殊字符
    if (includeSpecialChars) {
        chars += specialChars;
    }
    // 添加数字
    if (includeNumber) {
        chars += number;
    }

    // 移除排除的字符
    for (const char of excludedChars) {
        chars = chars.replace(new RegExp(char, "g"), "");
    }

    let password = "";
    let valid = false;

    w: while (!valid) {
        password = "";

        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            const randomIndex = randomValues[i] % chars.length;
            const char = chars.charAt(randomIndex);

            if (password.charAt(password.length - 1) === char) {
                continue w;
            }

            password += char;
        }

        valid = isValidPassword(); // 检测密码是否符合要求
    }

    function isValidPassword(): boolean {
        const hasUpperCase = includeUpperCase ? new RegExp(`[${upperCaseLetters}]`).test(password) : true;
        const hasLowerCase = includeLowerCase ? new RegExp(`[${lowerCaseLetters}]`).test(password) : true;
        const hasSpecialChars = includeSpecialChars ? new RegExp(`[${specialChars}]`).test(password) : true;
        const hasNumber = includeNumber ? new RegExp(`[${number}]`).test(password) : true;
        const excludedCharsRegex = new RegExp(`[${excludedChars.join("")}]`);
        const hasExcludedChars = !excludedCharsRegex.test(password);
        const validLength = password.length >= length;

        return hasUpperCase && hasLowerCase && hasSpecialChars && hasNumber && hasExcludedChars && validLength;
    }
    return password;
}
