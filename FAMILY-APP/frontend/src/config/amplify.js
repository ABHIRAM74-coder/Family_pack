
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "ap-southeast-2_YdqECK6R5",
      userPoolClientId: "6cdd28hjibs4ksgfjdo84h3drs",
      loginWith: {
        email: true,
      },
      signUpVerificationMethod: "code",
    },
  },
});

export default Amplify;
