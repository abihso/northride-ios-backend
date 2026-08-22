import Joi from 'joi';

const loginSchema = Joi.object({
  email: Joi.string().required().messages({
    'string.empty': 'Username is required',
    'any.required': 'Username is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.empty': 'Password is required',
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  })
});

export const validateLogin = (req, res, next) => {
  const { error } = loginSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errorMessages
    });
  }
  
  next();
};