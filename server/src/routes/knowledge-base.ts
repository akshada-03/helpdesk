import { Router } from "express";

export const knowledgeBaseRouter = Router();

export interface KnowledgeArticle {
  id: string;
  category: string;
  question: string;
  answer: string;
  steps?: string[];
  resolutionType: "instant_ai" | "agent_review";
  exampleKeywords: string[];
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: "forgot-password",
    category: "Account & Login",
    question: "I forgot my password. What should I do?",
    answer: "You can reset your password directly from the login page.",
    steps: [
      "Go to the login page.",
      "Click on 'Forgot Password'.",
      "Enter your registered email address.",
      "Follow the instructions in the password reset email.",
      "If you don't see the email within a few minutes, check your Spam or Promotions folder.",
    ],
    resolutionType: "instant_ai",
    exampleKeywords: ["forgot password", "reset password", "lost password", "password reset"],
  },
  {
    id: "not-receiving-reset-email",
    category: "Account & Login",
    question: "I am not receiving the password reset email.",
    answer:
      "If the reset email has not arrived within 10 minutes, verify that the email was entered correctly, check your spam folder, or contact support.",
    resolutionType: "instant_ai",
    exampleKeywords: ["no reset email", "password email missing", "reset not received"],
  },
  {
    id: "cannot-sign-in",
    category: "Account & Login",
    question: "I can't sign in to my account.",
    answer: "Follow these 5 troubleshooting steps in order to regain access:",
    steps: [
      "Confirm you are using the email address you purchased with (check your receipt).",
      "Use 'Forgot Password' on the login page to set a fresh password.",
      "Check that Caps Lock is off and avoid autofill errors by typing your password manually.",
      "Try an incognito/private browser window to rule out conflicting browser extensions.",
      "Clear your browser's cookies and site cache.",
      "If you still cannot sign in, email support with your account email and any error message displayed.",
    ],
    resolutionType: "instant_ai",
    exampleKeywords: ["cannot sign in", "login failed", "unable to login", "sign in problem"],
  },
  {
    id: "course-not-showing",
    category: "Course Access & Purchases",
    question: "I purchased a course but cannot see it in my dashboard.",
    answer:
      "Check your receipt email to verify you are logged in with the exact email address used at checkout. Purchases are tied to the purchasing email account.",
    resolutionType: "instant_ai",
    exampleKeywords: ["missing course", "course not showing", "cannot find purchased course"],
  },
  {
    id: "course-transfer",
    category: "Course Access & Purchases",
    question: "Can I transfer a purchased course to another account?",
    answer:
      "Courses are non-transferable and permanently attached to the account used during checkout.",
    resolutionType: "instant_ai",
    exampleKeywords: ["transfer course", "move course to another email", "share account"],
  },
  {
    id: "lifetime-access",
    category: "Lifetime Access",
    question: "What does Lifetime Access include?",
    answer:
      "Lifetime Access means you pay once and retain permanent access to the course and all future updates released for that specific course.",
    resolutionType: "instant_ai",
    exampleKeywords: ["lifetime access", "future updates", "course expiration", "how long access"],
  },
  {
    id: "refund-policy",
    category: "Refund Policy",
    question: "What is the 30-day refund policy?",
    answer:
      "We offer a 30-day money-back guarantee. A full refund is available within 30 days of purchase if less than 80% of the course has been completed. Refunds are processed within 5-10 business days.",
    resolutionType: "instant_ai",
    exampleKeywords: ["refund policy", "money back guarantee", "cancel purchase", "refund timeline"],
  },
  {
    id: "refund-request",
    category: "Refund Policy",
    question: "How do I request a refund for a course?",
    answer:
      "Email support with your purchase receipt and the reason for your refund request. A human agent will review your course progress and initiate the refund.",
    resolutionType: "agent_review",
    exampleKeywords: ["need refund", "request refund", "money back", "cancel and refund"],
  },
  {
    id: "certificates",
    category: "Certificates",
    question: "Do you provide course completion certificates?",
    answer:
      "Yes! A certificate of completion is automatically generated inside your dashboard once all course lessons are 100% completed.",
    resolutionType: "instant_ai",
    exampleKeywords: ["certificate", "completion certificate", "accredited degree", "diploma"],
  },
  {
    id: "download-videos",
    category: "Downloading Content",
    question: "Can I download course videos for offline viewing?",
    answer:
      "Videos are streamed online and cannot be downloaded for offline viewing. However, all source code, project files, and cheat sheets are fully downloadable.",
    resolutionType: "instant_ai",
    exampleKeywords: ["download video", "offline view", "watch offline", "download source code"],
  },
  {
    id: "video-playback",
    category: "Technical Issues",
    question: "Videos are not playing or buffering slowly.",
    answer: "Work through these quick checks:",
    steps: [
      "Clear your browser cache and reload the page.",
      "Use the latest version of Chrome, Edge, Safari, or Firefox.",
      "Disable ad blockers or conflicting browser extensions.",
      "Check your internet speed (video quality adjusts automatically).",
    ],
    resolutionType: "instant_ai",
    exampleKeywords: ["video not playing", "buffering", "black screen", "video playback error"],
  },
  {
    id: "coupon-codes",
    category: "Coupon Codes",
    question: "My coupon code is not working at checkout.",
    answer:
      "Coupons may be expired, single-use, or limited to specific courses. Only one coupon can be applied per checkout.",
    resolutionType: "instant_ai",
    exampleKeywords: ["coupon invalid", "discount code not working", "promo code"],
  },
  {
    id: "change-email",
    category: "Account Changes",
    question: "How do I change my registered email address?",
    answer:
      "To protect your account security, email changes require human agent verification. Email support with your current email, new email, and proof of purchase.",
    resolutionType: "agent_review",
    exampleKeywords: ["change email", "update email address", "new email on account"],
  },
  {
    id: "custom-bugs",
    category: "Technical Issues",
    question: "Specific technical bugs, signout loops, or platform glitches",
    answer:
      "For novel technical issues or platform bugs, email support with your browser version and a description or screenshot of the error. A support agent will investigate and resolve the issue.",
    resolutionType: "agent_review",
    exampleKeywords: ["bug", "signout loop", "glitch", "crash", "render error"],
  },
];

knowledgeBaseRouter.get("/", (_req, res) => {
  res.json({
    supportEmail: "ahsupport4@gmail.com",
    articles: KNOWLEDGE_ARTICLES,
  });
});
