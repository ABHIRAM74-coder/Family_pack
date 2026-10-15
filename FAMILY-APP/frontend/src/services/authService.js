
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
  updateUserAttributes,
} from "aws-amplify/auth";

export const registerUser = (email, password) => {
  return signUp({
    username: email.trim().toLowerCase(),
    password,
    options: {
      userAttributes: {
        email: email.trim().toLowerCase(),
      },
    },
  });
};

export const verifyEmailOTP = (email, code) => {
  return confirmSignUp({
    username: email.trim().toLowerCase(),
    confirmationCode: code,
  });
};

export const resendEmailOTP = (email) => {
  return resendSignUpCode({
    username: email.trim().toLowerCase(),
  });
};

export const loginUser = (email, password) => {
  return signIn({
    username: email.trim().toLowerCase(),
    password,
    options: {
      authFlowType: "USER_SRP_AUTH",
    },
  });
};

export const logoutUser = () => signOut();

export const getLoggedInUser = () => getCurrentUser();

export const getUserDetails = () => fetchUserAttributes();

export const saveUserDetails = (name, birthdate) => {
  return updateUserAttributes({
    userAttributes: {
      name,
      birthdate,
    },
  });
};
