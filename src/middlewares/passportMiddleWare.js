import passport from "passport"
const passportMiddleWare = (req,res,next) => {
    passport.authenticate("local",(err,user,info) => {
        console.log("hit")
    if(err){
        return res.status(401).json({message : err})
    } else{ 
        next(null)
    }
})
}

export default passportMiddleWare