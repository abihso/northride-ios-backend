import bcrypt  from 'bcrypt';


const verifyPassword = (hass,plain) => {
    return bcrypt.compareSync(plain,hass) 
}

export default verifyPassword