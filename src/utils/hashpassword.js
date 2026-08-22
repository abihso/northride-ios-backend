import bcrypt from "bcrypt"

const hashpassword = (p) => {
    return bcrypt.hashSync(p,bcrypt.genSaltSync(10))
}

export default hashpassword