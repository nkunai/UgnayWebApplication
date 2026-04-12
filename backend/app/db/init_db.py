import json
from datetime import datetime

from sqlalchemy import inspect
from sqlalchemy.orm import Session
from sqlalchemy.sql import text

from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.activity_attempt import ActivityAttempt, ActivityAttemptItem
from app.models.admin_audit_log import AdminAuditLog
from app.models.module import Module
from app.models.module_activity import ModuleActivity
from app.models.assessment_report import AssessmentReport
from app.models.certificate import CertificateTemplate, IssuedCertificate
from app.models.enrollment import Enrollment
from app.models.lms_progress import SectionModuleItemProgress, SectionModuleProgress
from app.models.registration import Registration
from app.models.section import Section, SectionStudentAssignment, SectionTeacherAssignment
from app.models.section_module import SectionModule, SectionModuleItem
from app.models.user import User

SEED_MODULES = [
    {
        "slug": "fsl-alphabets",
        "title": "Module 1: FSL Alphabets",
        "description": (
            "This module introduces the Filipino Sign Language (FSL) alphabet through fingerspelling. "
            "Students learn how to form each letter using hand shapes and movements, which serves as a "
            "foundation for all succeeding modules. Mastery of the alphabet allows learners to spell names, "
            "unfamiliar words, and specific terms that may not yet have dedicated signs."
        ),
        "order_index": 1,
        "lessons": [
            {
                "id": "m1-l1",
                "title": "Letters A-I",
                "content": (
                    "Focus on clean handshape formation for letters A, B, C, D, E, F, G, H, and I.\n"
                    "Practice each letter slowly, then spell short names using A-I letters."
                ),
            },
            {
                "id": "m1-l2",
                "title": "Letters J-R",
                "content": (
                    "Practice transitions and orientation for J through R.\n"
                    "Note: J is a moving gesture, so follow the motion path while keeping the handshape clear."
                ),
            },
            {
                "id": "m1-l3",
                "title": "Letters S-Z",
                "content": (
                    "Finalize finger spelling fluency for S through Z.\n"
                    "Note: Z is a moving gesture, so trace its motion clearly while maintaining clean handshape."
                ),
            },
        ],
        "assessments": [
            {
                "id": "m1-q1",
                "question": "Which set best describes finger spelling?",
                "choices": [
                    "Letter-by-letter handshapes",
                    "Whole sentence movement only",
                    "Voice-only response",
                    "Body posture only",
                ],
                "answer": "Letter-by-letter handshapes",
            },
            {
                "id": "m1-q2",
                "question": "Which letters in this module are moving gestures?",
                "choices": ["J and Z", "A and E", "C and O", "M and N"],
                "answer": "J and Z",
            },
            {
                "id": "m1-q3",
                "question": "What is the best strategy for signing unfamiliar words?",
                "choices": [
                    "Finger-spell the word clearly letter by letter",
                    "Skip difficult letters",
                    "Use random gestures",
                    "Mouth the word without signing",
                ],
                "answer": "Finger-spell the word clearly letter by letter",
            },
            {
                "id": "m1-q4",
                "question": "Why is alphabet mastery important in FSL?",
                "choices": [
                    "It helps sign names and specific terms",
                    "It replaces all vocabulary signs",
                    "It removes the need for practice",
                    "It is only used in formal events",
                ],
                "answer": "It helps sign names and specific terms",
            },
            {
                "id": "m1-q5",
                "question": "When practicing fingerspelling, what should come first?",
                "choices": [
                    "Clear handshape and readable pacing",
                    "Very fast movement",
                    "Large arm swings",
                    "Looking away from the receiver",
                ],
                "answer": "Clear handshape and readable pacing",
            }
        ],
    },
    {
        "slug": "numbers",
        "title": "Module 2: Numbers",
        "description": (
            "This module focuses on numbers and counting in FSL. Students learn how to sign numbers from "
            "basic to higher values and apply them in real-life contexts such as counting objects, telling "
            "quantities, and asking numerical questions. This builds essential skills for everyday communication "
            "involving amounts and measurements."
        ),
        "order_index": 2,
        "lessons": [
            {"id": "m2-l1", "title": "Numbers 0-10", "content": "Practice number signs from 0 to 10 with clear hand orientation."},
            {"id": "m2-l2", "title": "Numbers 11-20", "content": "Review transitions and movement patterns for signs 11 to 20."},
            {
                "id": "m2-l3",
                "title": "Numbers 21-30",
                "content": "Practice signs from 21 to 30 and keep shape transitions smooth.",
            },
            {
                "id": "m2-l4",
                "title": "Numbers 31-40",
                "content": "Build fluency for numbers 31 to 40 using consistent handshape control.",
            },
            {
                "id": "m2-l5",
                "title": "Numbers 41-50",
                "content": "Practice signs from 41 to 50 and apply them in quick counting drills.",
            },
            {
                "id": "m2-l6",
                "title": "60, 70, 80, 90, 100",
                "content": (
                    "Study the shortcut signs for 60, 70, 80, 90, and 100 in one focused lesson.\n"
                    "Note: Familiarize the signs for 1-9 so you can combine them with tens (60, 70, 80, 90) "
                    "to sign full numbers such as 61-69, 71-79, 81-89, and 91-99."
                ),
            },
        ],
        "assessments": [
            {
                "id": "m2-q1",
                "question": "What should you focus on when signing numbers?",
                "choices": [
                    "Correct finger orientation and clarity",
                    "Random speed without control",
                    "Ignoring hand position",
                    "Looking away from the receiver",
                ],
                "answer": "Correct finger orientation and clarity",
            },
            {
                "id": "m2-q2",
                "question": "To sign a number like 67, what should you combine?",
                "choices": [
                    "The tens sign (60) and the ones sign (7)",
                    "Only the sign for 7",
                    "Only the sign for 60",
                    "A fingerspelled word for sixty-seven",
                ],
                "answer": "The tens sign (60) and the ones sign (7)",
            },
            {
                "id": "m2-q3",
                "question": "Which lesson focuses on shortcut higher-number signs?",
                "choices": ["60, 70, 80, 90, 100", "0-10", "11-20", "21-30"],
                "answer": "60, 70, 80, 90, 100",
            },
            {
                "id": "m2-q4",
                "question": "Why are number signs essential in daily communication?",
                "choices": [
                    "They help express amounts and quantities",
                    "They are used only in games",
                    "They replace all greeting signs",
                    "They are only for exams",
                ],
                "answer": "They help express amounts and quantities",
            },
            {
                "id": "m2-q5",
                "question": "Before mastering 71-79, what foundation is most important?",
                "choices": [
                    "Familiarity with 1-9 and the tens pattern",
                    "Only memorizing 100",
                    "Skipping signs below 20",
                    "Using voice instead of sign",
                ],
                "answer": "Familiarity with 1-9 and the tens pattern",
            }
        ],
    },
    {
        "slug": "common-words",
        "title": "Module 3: Greetings & Basic Expressions",
        "description": (
            "This module covers commonly used greetings and polite expressions. Students learn how to initiate "
            "and end conversations, respond appropriately, and express basic intentions. These signs are essential "
            "for building confidence in interacting with others in both formal and informal settings."
        ),
        "order_index": 3,
        "lessons": [
            {
                "id": "m3-l1",
                "title": "Daily Greetings",
                "content": (
                    "Focus on common greeting expressions:\n"
                    "- GOOD MORNING\n"
                    "- GOOD AFTERNOON\n"
                    "- GOOD EVENING\n"
                    "- HELLO"
                ),
            },
            {
                "id": "m3-l2",
                "title": "Check-In and Introduction",
                "content": (
                    "Practice these expressions for meeting and conversation starters:\n"
                    "- HOW ARE YOU\n"
                    "- I'M FINE\n"
                    "- NICE TO MEET YOU"
                ),
            },
            {
                "id": "m3-l3",
                "title": "Courtesy and Parting",
                "content": (
                    "Use these for polite responses and closing conversations:\n"
                    "- THANK YOU\n"
                    "- YOU'RE WELCOME\n"
                    "- SEE YOU TOMORROW"
                ),
            },
        ],
        "assessments": [
            {
                "id": "m3-q1",
                "question": "What is the best goal when reviewing daily interaction signs?",
                "choices": ["Consistency and clear meaning", "Fast random signing", "Minimal hand movement", "Skipping practice"],
                "answer": "Consistency and clear meaning",
            },
            {
                "id": "m3-q2",
                "question": "Which greeting best fits a morning conversation start?",
                "choices": ["GOOD MORNING", "SEE YOU TOMORROW", "YOU'RE WELCOME", "I'M FINE"],
                "answer": "GOOD MORNING",
            },
            {
                "id": "m3-q3",
                "question": "After someone signs HOW ARE YOU, which response is appropriate?",
                "choices": ["I'M FINE", "GOOD EVENING", "THANK YOU", "HELLO"],
                "answer": "I'M FINE",
            },
            {
                "id": "m3-q4",
                "question": "What is a polite reply to THANK YOU?",
                "choices": ["YOU'RE WELCOME", "DON'T KNOW", "NO", "SLOW"],
                "answer": "YOU'RE WELCOME",
            },
            {
                "id": "m3-q5",
                "question": "Which sign is commonly used to end a conversation politely?",
                "choices": ["SEE YOU TOMORROW", "HOW ARE YOU", "HELLO", "GOOD MORNING"],
                "answer": "SEE YOU TOMORROW",
            }
        ],
    },
    {
        "slug": "family-members",
        "title": "Module 4: Family Members",
        "description": (
            "This module introduces vocabulary related to family and relationships. Students learn how to "
            "identify family members and explain relationships between individuals. This helps learners "
            "communicate about their personal lives and understand others in similar contexts."
        ),
        "order_index": 4,
        "lessons": [
            {"id": "m4-l1", "title": "FATHER", "content": "Practice the sign for FATHER in simple family introductions."},
            {"id": "m4-l2", "title": "MOTHER", "content": "Practice the sign for MOTHER in simple family introductions."},
            {"id": "m4-l3", "title": "SON", "content": "Practice the sign for SON and use it in relationship examples."},
            {"id": "m4-l4", "title": "DAUGHTER", "content": "Practice the sign for DAUGHTER and use it in relationship examples."},
            {"id": "m4-l5", "title": "GRANDFATHER", "content": "Practice the sign for GRANDFATHER clearly and consistently."},
            {"id": "m4-l6", "title": "GRANDMOTHER", "content": "Practice the sign for GRANDMOTHER clearly and consistently."},
            {"id": "m4-l7", "title": "UNCLE", "content": "Review and practice the sign for UNCLE in context."},
            {"id": "m4-l8", "title": "AUNTIE", "content": "Review and practice the sign for AUNTIE in context."},
            {"id": "m4-l9", "title": "COUSIN", "content": "Practice the sign for COUSIN in family conversation examples."},
            {"id": "m4-l10", "title": "PARENTS", "content": "Practice the sign for PARENTS in complete family statements."},
        ],
        "assessments": [
            {
                "id": "m4-q1",
                "question": "Why is learning family signs important?",
                "choices": [
                    "To explain relationships in real conversations",
                    "To avoid introducing people",
                    "To replace all other vocabulary",
                    "To sign random words only",
                ],
                "answer": "To explain relationships in real conversations",
            },
            {
                "id": "m4-q2",
                "question": "Which signs can be combined to communicate PARENTS?",
                "choices": [
                    "FATHER and MOTHER",
                    "SON and DAUGHTER",
                    "UNCLE and AUNTIE",
                    "COUSIN and GRANDMOTHER",
                ],
                "answer": "FATHER and MOTHER",
            },
            {
                "id": "m4-q3",
                "question": "Which sign best identifies your parent's father?",
                "choices": ["GRANDFATHER", "UNCLE", "COUSIN", "SON"],
                "answer": "GRANDFATHER",
            },
            {
                "id": "m4-q4",
                "question": "If introducing your mother's sister, which sign do you use?",
                "choices": ["AUNTIE", "DAUGHTER", "MOTHER", "PARENTS"],
                "answer": "AUNTIE",
            },
            {
                "id": "m4-q5",
                "question": "What makes family-sign practice effective?",
                "choices": [
                    "Using each sign in relationship examples",
                    "Memorizing without context",
                    "Practicing only one sign repeatedly",
                    "Skipping review of similar signs",
                ],
                "answer": "Using each sign in relationship examples",
            }
        ],
    },
    {
        "slug": "people-description",
        "title": "Module 5: People Description",
        "description": (
            "This module focuses on describing people in FSL. Students learn how to identify and describe "
            "individuals using clear descriptive signs. This helps learners give details and communicate "
            "about people more accurately in daily interactions."
        ),
        "order_index": 5,
        "lessons": [
            {"id": "m5-l1", "title": "BOY", "content": "Practice the sign for BOY in identification phrases."},
            {"id": "m5-l2", "title": "GIRL", "content": "Practice the sign for GIRL in identification phrases."},
            {"id": "m5-l3", "title": "MAN", "content": "Practice the sign for MAN in description examples."},
            {"id": "m5-l4", "title": "WOMAN", "content": "Practice the sign for WOMAN in description examples."},
            {"id": "m5-l5", "title": "DEAF", "content": "Use the sign for DEAF correctly in respectful context."},
            {"id": "m5-l6", "title": "HARD OF HEARING", "content": "Practice the sign for HARD OF HEARING in clear context."},
            {"id": "m5-l7", "title": "WEELCHAIR PERSON", "content": "Practice the sign for WEELCHAIR PERSON in contextual statements."},
            {"id": "m5-l8", "title": "BLIND", "content": "Practice the sign for BLIND in people description examples."},
            {"id": "m5-l9", "title": "DEAF BLIND", "content": "Practice the sign for DEAF BLIND in contextual use."},
            {"id": "m5-l10", "title": "MARRIED", "content": "Practice the sign for MARRIED in personal-information statements."},
        ],
        "assessments": [
            {
                "id": "m5-q1",
                "question": "What is the best use of people description signs?",
                "choices": [
                    "To give clear details about a person",
                    "To avoid identifying anyone",
                    "To sign without context",
                    "To use only fingerspelling always",
                ],
                "answer": "To give clear details about a person",
            },
            {
                "id": "m5-q2",
                "question": "Which sign should be used when describing marital status?",
                "choices": ["MARRIED", "BLIND", "DEAF", "MAN"],
                "answer": "MARRIED",
            },
            {
                "id": "m5-q3",
                "question": "Which option refers to a person who is both deaf and blind?",
                "choices": ["DEAF BLIND", "HARD OF HEARING", "GIRL", "BOY"],
                "answer": "DEAF BLIND",
            },
            {
                "id": "m5-q4",
                "question": "Which approach is most respectful when describing someone?",
                "choices": [
                    "Use accurate signs and clear context",
                    "Use labels without context",
                    "Avoid descriptive details",
                    "Guess signs without confirmation",
                ],
                "answer": "Use accurate signs and clear context",
            },
            {
                "id": "m5-q5",
                "question": "What is the main communication goal of this module?",
                "choices": [
                    "Describe people clearly and appropriately",
                    "Replace greeting signs entirely",
                    "Focus only on spelling names",
                    "Avoid conversation context",
                ],
                "answer": "Describe people clearly and appropriately",
            }
        ],
    },
    {
        "slug": "days",
        "title": "Module 6: Days",
        "description": (
            "This module covers time-related concepts in FSL. Students learn how to express days of the week, "
            "parts of the day, and general time references such as past, present, and future. This allows "
            "learners to organize information and communicate schedules or sequences of events."
        ),
        "order_index": 6,
        "lessons": [
            {"id": "m6-l1", "title": "MONDAY", "content": "Practice the sign for MONDAY with clear form and timing context."},
            {"id": "m6-l2", "title": "TUESDAY", "content": "Practice the sign for TUESDAY with clear form and timing context."},
            {"id": "m6-l3", "title": "WEDNESDAY", "content": "Practice the sign for WEDNESDAY with clear form and timing context."},
            {"id": "m6-l4", "title": "THURSDAY", "content": "Practice the sign for THURSDAY with clear form and timing context."},
            {"id": "m6-l5", "title": "FRIDAY", "content": "Practice the sign for FRIDAY with clear form and timing context."},
            {"id": "m6-l6", "title": "SATURDAY", "content": "Practice the sign for SATURDAY with clear form and timing context."},
            {"id": "m6-l7", "title": "SUNDAY", "content": "Practice the sign for SUNDAY with clear form and timing context."},
            {"id": "m6-l8", "title": "TODAY", "content": "Practice the sign for TODAY in schedule and activity statements."},
            {"id": "m6-l9", "title": "TOMORROW", "content": "Practice the sign for TOMORROW in schedule and activity statements."},
            {"id": "m6-l10", "title": "YESTERDAY", "content": "Practice the sign for YESTERDAY in schedule and activity statements."},
        ],
        "assessments": [
            {
                "id": "m6-q1",
                "question": "Why are time-reference signs useful?",
                "choices": [
                    "They help organize events and schedules",
                    "They remove the need for context",
                    "They replace all noun signs",
                    "They are only for greetings",
                ],
                "answer": "They help organize events and schedules",
            },
            {
                "id": "m6-q2",
                "question": "Which sign best indicates a past event?",
                "choices": ["YESTERDAY", "TOMORROW", "TODAY", "MONDAY"],
                "answer": "YESTERDAY",
            },
            {
                "id": "m6-q3",
                "question": "If a class is next day, which time-reference sign is correct?",
                "choices": ["TOMORROW", "YESTERDAY", "SUNDAY", "TODAY"],
                "answer": "TOMORROW",
            },
            {
                "id": "m6-q4",
                "question": "What is the best way to sign schedules clearly?",
                "choices": [
                    "Combine day signs with time references",
                    "Use random day signs",
                    "Skip day and time signs",
                    "Use only fingerspelling",
                ],
                "answer": "Combine day signs with time references",
            },
            {
                "id": "m6-q5",
                "question": "Which sign names a specific weekday?",
                "choices": ["FRIDAY", "TODAY", "TOMORROW", "YESTERDAY"],
                "answer": "FRIDAY",
            }
        ],
    },
    {
        "slug": "colors-descriptions",
        "title": "Module 7: Colors & Descriptions",
        "description": (
            "This module introduces descriptive signs, including colors, sizes, and qualities. Students learn "
            "how to describe objects and people more clearly. This enhances their ability to provide details "
            "and make their communication more specific."
        ),
        "order_index": 7,
        "lessons": [
            {"id": "m7-l1", "title": "BLUE", "content": "Practice the sign for BLUE in object description examples."},
            {"id": "m7-l2", "title": "GREEN", "content": "Practice the sign for GREEN in object description examples."},
            {"id": "m7-l3", "title": "RED", "content": "Practice the sign for RED in object description examples."},
            {"id": "m7-l4", "title": "BROWN", "content": "Practice the sign for BROWN in object description examples."},
            {"id": "m7-l5", "title": "BLACK", "content": "Practice the sign for BLACK in object description examples."},
            {"id": "m7-l6", "title": "WHITE", "content": "Practice the sign for WHITE in object description examples."},
            {"id": "m7-l7", "title": "YELLOW", "content": "Practice the sign for YELLOW in object description examples."},
            {"id": "m7-l8", "title": "ORANGE", "content": "Practice the sign for ORANGE in object description examples."},
            {"id": "m7-l9", "title": "GRAY", "content": "Practice the sign for GRAY in object description examples."},
            {"id": "m7-l10", "title": "PINK", "content": "Practice the sign for PINK in object description examples."},
            {"id": "m7-l11", "title": "VIOLET", "content": "Practice the sign for VIOLET in object description examples."},
            {"id": "m7-l12", "title": "LIGHT", "content": "Practice the sign for LIGHT as a descriptive quality in context."},
            {"id": "m7-l13", "title": "DARK", "content": "Practice the sign for DARK as a descriptive quality in context."},
        ],
        "assessments": [
            {
                "id": "m7-q1",
                "question": "What is the goal of descriptive signs?",
                "choices": [
                    "To make communication more specific",
                    "To avoid describing anything",
                    "To sign only verbs",
                    "To skip visual details",
                ],
                "answer": "To make communication more specific",
            },
            {
                "id": "m7-q2",
                "question": "Which pair represents brightness contrast in this module?",
                "choices": ["LIGHT and DARK", "BLUE and RED", "WHITE and BLACK", "GREEN and BROWN"],
                "answer": "LIGHT and DARK",
            },
            {
                "id": "m7-q3",
                "question": "If you need to describe a red object, which sign is required?",
                "choices": ["RED", "PINK", "ORANGE", "GRAY"],
                "answer": "RED",
            },
            {
                "id": "m7-q4",
                "question": "How do descriptive signs improve conversations?",
                "choices": [
                    "They add clearer visual details",
                    "They remove context from sentences",
                    "They replace all noun signs",
                    "They reduce communication accuracy",
                ],
                "answer": "They add clearer visual details",
            },
            {
                "id": "m7-q5",
                "question": "When two objects are similar, what helps distinguish them?",
                "choices": [
                    "Use color and quality signs together",
                    "Use only a pointing gesture",
                    "Avoid descriptive signs",
                    "Repeat one random sign",
                ],
                "answer": "Use color and quality signs together",
            }
        ],
    },
    {
        "slug": "basic-conversations",
        "title": "Module 8: Basic Conversations",
        "description": (
            "This module integrates all previously learned signs into simple conversations. Students practice "
            "forming complete thoughts, asking and answering questions, and maintaining short dialogues. The "
            "goal is to develop functional communication skills and prepare learners for real-world interactions "
            "using FSL."
        ),
        "order_index": 8,
        "lessons": [
            {"id": "m8-l1", "title": "UNDERSTAND", "content": "Practice using UNDERSTAND in short conversation responses."},
            {"id": "m8-l2", "title": "DON'T UNDERSTAND", "content": "Practice using DON'T UNDERSTAND to ask for clarification."},
            {"id": "m8-l3", "title": "KNOW", "content": "Practice using KNOW in basic conversation exchanges."},
            {"id": "m8-l4", "title": "DON'T KNOW", "content": "Practice using DON'T KNOW in basic conversation exchanges."},
            {"id": "m8-l5", "title": "NO", "content": "Practice using NO clearly in question-and-answer dialogue."},
            {"id": "m8-l6", "title": "YES", "content": "Practice using YES clearly in question-and-answer dialogue."},
            {"id": "m8-l7", "title": "WRONG", "content": "Practice using WRONG as a corrective response in dialogue."},
            {"id": "m8-l8", "title": "CORRECT", "content": "Practice using CORRECT as a confirming response in dialogue."},
            {"id": "m8-l9", "title": "SLOW", "content": "Practice using SLOW in conversation pacing requests."},
            {"id": "m8-l10", "title": "FAST", "content": "Practice using FAST in conversation pacing requests."},
        ],
        "assessments": [
            {
                "id": "m8-q1",
                "question": "What is the main purpose of this module?",
                "choices": [
                    "Develop functional communication in real interactions",
                    "Memorize isolated signs only",
                    "Avoid asking questions",
                    "Use fingerspelling for every phrase",
                ],
                "answer": "Develop functional communication in real interactions",
            },
            {
                "id": "m8-q2",
                "question": "If you miss part of a message, which response is most appropriate?",
                "choices": ["DON'T UNDERSTAND", "CORRECT", "YES", "FAST"],
                "answer": "DON'T UNDERSTAND",
            },
            {
                "id": "m8-q3",
                "question": "Which sign is best for confirming accuracy?",
                "choices": ["CORRECT", "WRONG", "NO", "DON'T KNOW"],
                "answer": "CORRECT",
            },
            {
                "id": "m8-q4",
                "question": "Which sign can request slower pacing in a conversation?",
                "choices": ["SLOW", "FAST", "KNOW", "UNDERSTAND"],
                "answer": "SLOW",
            },
            {
                "id": "m8-q5",
                "question": "What skill is emphasized across this module's lessons?",
                "choices": [
                    "Responding appropriately in short dialogues",
                    "Avoiding responses in conversation",
                    "Using only one-word answers",
                    "Skipping question-and-answer practice",
                ],
                "answer": "Responding appropriately in short dialogues",
            }
        ],
    },
]
SEED_MODULES.extend(
    [
        {
            "slug": "module-9-draft",
            "title": "Module 9: Draft Curriculum Slot",
            "description": (
                "Reserved backend slot for the next Hand and Heart curriculum module. "
                "Keep this unpublished until the final lesson media and activity set are approved."
            ),
            "order_index": 9,
            "lessons": [
                {
                    "id": "m9-l1",
                    "title": "Pending Content Review",
                    "content": "Curriculum content for Module 9 is still being finalized.",
                }
            ],
            "assessments": [],
            "is_published": False,
        },
        {
            "slug": "module-10-draft",
            "title": "Module 10: Draft Curriculum Slot",
            "description": (
                "Reserved backend slot for the next Hand and Heart curriculum module. "
                "Keep this unpublished until the final lesson media and activity set are approved."
            ),
            "order_index": 10,
            "lessons": [
                {
                    "id": "m10-l1",
                    "title": "Pending Content Review",
                    "content": "Curriculum content for Module 10 is still being finalized.",
                }
            ],
            "assessments": [],
            "is_published": False,
        },
        {
            "slug": "module-11-draft",
            "title": "Module 11: Draft Curriculum Slot",
            "description": (
                "Reserved backend slot for the next Hand and Heart curriculum module. "
                "Keep this unpublished until the final lesson media and activity set are approved."
            ),
            "order_index": 11,
            "lessons": [
                {
                    "id": "m11-l1",
                    "title": "Pending Content Review",
                    "content": "Curriculum content for Module 11 is still being finalized.",
                }
            ],
            "assessments": [],
            "is_published": False,
        },
        {
            "slug": "module-12-draft",
            "title": "Module 12: Draft Curriculum Slot",
            "description": (
                "Reserved backend slot for the next Hand and Heart curriculum module. "
                "Keep this unpublished until the final lesson media and activity set are approved."
            ),
            "order_index": 12,
            "lessons": [
                {
                    "id": "m12-l1",
                    "title": "Pending Content Review",
                    "content": "Curriculum content for Module 12 is still being finalized.",
                }
            ],
            "assessments": [],
            "is_published": False,
        },
    ]
)


def _seed_module_by_slug(slug: str) -> dict:
    return next(item for item in SEED_MODULES if item["slug"] == slug)


def _multiple_choice_definition(slug: str) -> dict:
    module = _seed_module_by_slug(slug)
    return {
        "items": [
            {
                "item_key": item["id"],
                "prompt": item["question"],
                "choices": list(item["choices"]),
                "expected_answer": item["answer"],
            }
            for item in module["assessments"]
        ]
    }


MODULE_ACTIVITY_BLUEPRINTS_BY_SLUG: dict[str, list[dict]] = {
    "fsl-alphabets": [
        {
            "activity_key": "m1-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the full alphabet review quiz.",
            "definition": _multiple_choice_definition("fsl-alphabets"),
            "is_published": True,
        },
        {
            "activity_key": "m1-assessment-2",
            "title": "Assessment 2",
            "activity_type": "identification",
            "order_index": 2,
            "instructions": "Identify the hand sign shown in each image prompt.",
            "definition": {
                "items": [
                    {"item_key": "m1-i1", "prompt": "Alphabet image A", "expected_answer": "A"},
                    {"item_key": "m1-i2", "prompt": "Alphabet image J", "expected_answer": "J"},
                    {"item_key": "m1-i3", "prompt": "Alphabet image M", "expected_answer": "M"},
                    {"item_key": "m1-i4", "prompt": "Alphabet image T", "expected_answer": "T"},
                    {"item_key": "m1-i5", "prompt": "Alphabet image Z", "expected_answer": "Z"},
                ]
            },
            "is_published": True,
        },
        {
            "activity_key": "m1-assessment-3",
            "title": "Assessment 3",
            "activity_type": "practical_camera",
            "order_index": 3,
            "instructions": "Use the AI camera flow to sign the target letters.",
            "definition": {
                "ai_mode": "alphabet",
                "min_required": 5,
                "targets": ["A", "B", "C", "J", "Z"],
            },
            "is_published": True,
        },
    ],
    "numbers": [
        {
            "activity_key": "m2-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the numbers module quiz.",
            "definition": _multiple_choice_definition("numbers"),
            "is_published": True,
        },
        {
            "activity_key": "m2-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign numbers from 1 to 10 using the AI camera flow.",
            "definition": {"ai_mode": "numbers", "number_group": "0-10", "targets": ["1", "2", "3", "4", "5"]},
            "is_published": True,
        },
        {
            "activity_key": "m2-assessment-3",
            "title": "Assessment 3",
            "activity_type": "practical_camera",
            "order_index": 3,
            "instructions": "Sign numbers from 11 to 20 using the AI camera flow.",
            "definition": {"ai_mode": "numbers", "number_group": "11-20", "targets": ["11", "12", "13", "14", "15"]},
            "is_published": True,
        },
        {
            "activity_key": "m2-assessment-4",
            "title": "Assessment 4",
            "activity_type": "practical_camera",
            "order_index": 4,
            "instructions": "Sign numbers from 31 to 40 using the AI camera flow.",
            "definition": {"ai_mode": "numbers", "number_group": "31-40", "targets": ["31", "32", "33", "34", "35"]},
            "is_published": True,
        },
        {
            "activity_key": "m2-assessment-5",
            "title": "Assessment 5",
            "activity_type": "practical_camera",
            "order_index": 5,
            "instructions": "Sign numbers from 91 to 100 using the AI camera flow.",
            "definition": {"ai_mode": "numbers", "number_group": "91-100", "targets": ["91", "92", "93", "94", "95"]},
            "is_published": True,
        },
    ],
    "common-words": [
        {
            "activity_key": "m3-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the greetings quiz.",
            "definition": _multiple_choice_definition("common-words"),
            "is_published": True,
        },
        {
            "activity_key": "m3-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign greeting expressions using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "greeting",
                "targets": ["GOOD MORNING", "HELLO", "THANK YOU", "SEE YOU TOMORROW"],
            },
            "is_published": True,
        },
    ],
    "family-members": [
        {
            "activity_key": "m4-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the family members quiz.",
            "definition": _multiple_choice_definition("family-members"),
            "is_published": True,
        },
        {
            "activity_key": "m4-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign at least five family-member gestures using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "family",
                "targets": ["FATHER", "MOTHER", "SON", "DAUGHTER", "COUSIN"],
            },
            "is_published": True,
        },
    ],
    "people-description": [
        {
            "activity_key": "m5-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the people-description quiz.",
            "definition": _multiple_choice_definition("people-description"),
            "is_published": True,
        },
        {
            "activity_key": "m5-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign at least five people-description gestures using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "relationship",
                "targets": ["BOY", "GIRL", "DEAF", "BLIND", "MARRIED"],
            },
            "is_published": True,
        },
    ],
    "days": [
        {
            "activity_key": "m6-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the days and time-reference quiz.",
            "definition": _multiple_choice_definition("days"),
            "is_published": True,
        },
        {
            "activity_key": "m6-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign weekday and time-reference gestures using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "date",
                "targets": ["MONDAY", "FRIDAY", "TODAY", "TOMORROW", "YESTERDAY"],
            },
            "is_published": True,
        },
    ],
    "colors-descriptions": [
        {
            "activity_key": "m7-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the colors and descriptions quiz.",
            "definition": _multiple_choice_definition("colors-descriptions"),
            "is_published": True,
        },
        {
            "activity_key": "m7-assessment-2",
            "title": "Assessment 2",
            "activity_type": "identification",
            "order_index": 2,
            "instructions": "Identify the target color sign shown in each prompt.",
            "definition": {
                "items": [
                    {"item_key": "m7-i1", "prompt": "Color prompt BLUE", "expected_answer": "BLUE"},
                    {"item_key": "m7-i2", "prompt": "Color prompt RED", "expected_answer": "RED"},
                    {"item_key": "m7-i3", "prompt": "Color prompt YELLOW", "expected_answer": "YELLOW"},
                    {"item_key": "m7-i4", "prompt": "Color prompt PINK", "expected_answer": "PINK"},
                    {"item_key": "m7-i5", "prompt": "Color prompt VIOLET", "expected_answer": "VIOLET"},
                ]
            },
            "is_published": True,
        },
        {
            "activity_key": "m7-assessment-3",
            "title": "Assessment 3",
            "activity_type": "practical_camera",
            "order_index": 3,
            "instructions": "Sign at least five color or descriptive gestures using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "color",
                "targets": ["BLUE", "GREEN", "RED", "LIGHT", "DARK"],
            },
            "is_published": True,
        },
    ],
    "basic-conversations": [
        {
            "activity_key": "m8-assessment-1",
            "title": "Assessment 1",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Answer the basic-conversations quiz.",
            "definition": _multiple_choice_definition("basic-conversations"),
            "is_published": True,
        },
        {
            "activity_key": "m8-assessment-2",
            "title": "Assessment 2",
            "activity_type": "practical_camera",
            "order_index": 2,
            "instructions": "Sign at least five response gestures using the AI camera flow.",
            "definition": {
                "ai_mode": "words",
                "word_group": "responses",
                "targets": ["YES", "NO", "UNDERSTAND", "DON'T KNOW", "SLOW"],
            },
            "is_published": True,
        },
    ],
    "module-9-draft": [
        {
            "activity_key": "m9-assessment-1",
            "title": "Draft Activity",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Draft placeholder activity until the final module content is approved.",
            "definition": {"items": [{"item_key": "m9-d1", "prompt": "Draft placeholder question", "choices": ["Pending"], "expected_answer": "Pending"}]},
            "is_published": False,
        }
    ],
    "module-10-draft": [
        {
            "activity_key": "m10-assessment-1",
            "title": "Draft Activity",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Draft placeholder activity until the final module content is approved.",
            "definition": {"items": [{"item_key": "m10-d1", "prompt": "Draft placeholder question", "choices": ["Pending"], "expected_answer": "Pending"}]},
            "is_published": False,
        }
    ],
    "module-11-draft": [
        {
            "activity_key": "m11-assessment-1",
            "title": "Draft Activity",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Draft placeholder activity until the final module content is approved.",
            "definition": {"items": [{"item_key": "m11-d1", "prompt": "Draft placeholder question", "choices": ["Pending"], "expected_answer": "Pending"}]},
            "is_published": False,
        }
    ],
    "module-12-draft": [
        {
            "activity_key": "m12-assessment-1",
            "title": "Draft Activity",
            "activity_type": "multiple_choice",
            "order_index": 1,
            "instructions": "Draft placeholder activity until the final module content is approved.",
            "definition": {"items": [{"item_key": "m12-d1", "prompt": "Draft placeholder question", "choices": ["Pending"], "expected_answer": "Pending"}]},
            "is_published": False,
        }
    ],
}

REQUIRED_TABLES = {
    "admin_audit_logs",
    "activity_attempt_items",
    "activity_attempts",
    "archived_student_accounts",
    "assessment_reports",
    "batches",
    "certificate_templates",
    "enrollments",
    "issued_certificates",
    "module_activities",
    "modules",
    "password_reset_otps",
    "registrations",
    "section_module_item_progress",
    "section_module_items",
    "section_module_progress",
    "section_modules",
    "section_student_assignments",
    "section_teacher_assignments",
    "sections",
    "teacher_invites",
    "user_module_progress",
    "user_sessions",
    "users",
}


def _table_exists(table_name: str) -> bool:
    inspector = inspect(engine)
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    inspector = inspect(engine)
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(table_name: str, column_name: str, ddl: str) -> None:
    if _column_exists(table_name, column_name):
        return
    with engine.begin() as connection:
        connection.execute(text(ddl))


def _create_table_if_missing(table_name: str, ddl: str) -> None:
    if _table_exists(table_name):
        return
    with engine.begin() as connection:
        connection.execute(text(ddl))


def seed_modules(db: Session) -> None:
    for item in SEED_MODULES:
        existing = db.query(Module).filter(Module.order_index == item["order_index"]).first()
        if not existing:
            db.add(Module(**item))
            continue

        existing.slug = item["slug"]
        existing.title = item["title"]
        existing.description = item["description"]
        existing.lessons = item["lessons"]
        existing.assessments = item["assessments"]
        existing.is_published = item.get("is_published", True)
    db.commit()


def seed_module_activities(db: Session) -> None:
    modules_by_slug = {module.slug: module for module in db.query(Module).all()}
    for slug, activities in MODULE_ACTIVITY_BLUEPRINTS_BY_SLUG.items():
        module = modules_by_slug.get(slug)
        if not module:
            continue

        existing_by_key = {
            activity.activity_key: activity
            for activity in db.query(ModuleActivity).filter(ModuleActivity.module_id == module.id).all()
        }

        for activity in activities:
            existing = existing_by_key.get(activity["activity_key"])
            if existing is None:
                db.add(
                    ModuleActivity(
                        module_id=module.id,
                        activity_key=activity["activity_key"],
                        title=activity["title"],
                        activity_type=activity["activity_type"],
                        order_index=activity["order_index"],
                        instructions=activity.get("instructions"),
                        definition=activity.get("definition", {}),
                        is_published=activity.get("is_published", True),
                    )
                )
                continue

            existing.title = activity["title"]
            existing.activity_type = activity["activity_type"]
            existing.order_index = activity["order_index"]
            existing.instructions = activity.get("instructions")
            existing.definition = activity.get("definition", {})
            existing.is_published = activity.get("is_published", True)
            db.add(existing)

    db.commit()


def seed_demo_user(db: Session) -> None:
    existing_user = db.query(User).filter(User.username == "student_demo").first()
    if existing_user:
        return
    db.add(
        User(
            username="student_demo",
            password_hash=hash_password("student123"),
            role="student",
        )
    )
    db.commit()


def seed_admin_user(db: Session) -> None:
    existing_admin = db.query(User).filter(User.role == "admin", User.archived_at.is_(None)).first()
    if existing_admin:
        return
    db.add(
        User(
            username="admin_demo",
            email="admin@ugnay.local",
            password_hash=hash_password("Admin123!"),
            role="admin",
            first_name="System",
            last_name="Admin",
            must_change_password=False,
        )
    )
    db.commit()


def backfill_enrollments(db: Session) -> None:
    registrations = (
        db.query(Registration)
        .outerjoin(Enrollment, Enrollment.registration_id == Registration.id)
        .filter(Enrollment.id.is_(None))
        .all()
    )
    for registration in registrations:
        normalized_status = registration.status
        if normalized_status == "validated":
            normalized_status = "approved"

        payment_review_status = "submitted"
        if normalized_status == "approved":
            payment_review_status = "approved"
        elif normalized_status == "rejected":
            payment_review_status = "rejected"

        enrollment = Enrollment(
            registration_id=registration.id,
            user_id=registration.linked_user_id,
            status=normalized_status,
            payment_review_status=payment_review_status,
            review_notes=registration.notes,
            reviewed_at=registration.validated_at,
            approved_at=registration.validated_at if normalized_status == "approved" else None,
        )
        db.add(enrollment)

    db.commit()


def _coerce_json_value(raw_value):
    if raw_value in (None, ""):
        return []
    if isinstance(raw_value, (list, dict)):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return []
    return raw_value


def _coerce_datetime_value(raw_value) -> datetime | None:
    if raw_value in (None, ""):
        return None
    if isinstance(raw_value, datetime):
        return raw_value
    value = str(raw_value).replace("Z", "+00:00")
    return datetime.fromisoformat(value)


def _ensure_module_activity(
    db: Session,
    *,
    module_id: int,
    activity_key: str,
    activity_title: str,
    activity_type: str,
) -> ModuleActivity:
    activity = (
        db.query(ModuleActivity)
        .filter(ModuleActivity.module_id == module_id, ModuleActivity.activity_key == activity_key)
        .first()
    )
    if activity:
        return activity

    next_order = (
        db.query(ModuleActivity)
        .filter(ModuleActivity.module_id == module_id)
        .count()
        + 1
    )
    activity = ModuleActivity(
        module_id=module_id,
        activity_key=activity_key,
        title=activity_title,
        activity_type=activity_type or "legacy_import",
        order_index=next_order,
        instructions="Legacy activity imported during database bootstrap.",
        definition={"items": []},
        is_published=True,
    )
    db.add(activity)
    db.flush()
    return activity


def backfill_legacy_activity_attempts(db: Session) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if "activity_attempts" not in existing_tables or "module_activities" not in existing_tables:
        return

    detailed_import_keys: set[tuple[int, int, str]] = set()
    if "user_assessment_attempts" in existing_tables:
        legacy_rows = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    module_id,
                    assessment_id,
                    assessment_title,
                    assessment_type,
                    score_percent,
                    score_correct,
                    score_total,
                    answers,
                    snapshots,
                    submitted_at
                FROM user_assessment_attempts
                ORDER BY id ASC
                """
            )
        ).mappings()

        for row in legacy_rows:
            note_token = f"legacy_attempt_id={row['id']}"
            if (
                db.query(ActivityAttempt)
                .filter(ActivityAttempt.source == "legacy_import", ActivityAttempt.notes == note_token)
                .first()
            ):
                detailed_import_keys.add((row["user_id"], row["module_id"], str(row["assessment_id"])))
                continue

            activity = _ensure_module_activity(
                db,
                module_id=row["module_id"],
                activity_key=str(row["assessment_id"]),
                activity_title=str(row["assessment_title"] or row["assessment_id"]),
                activity_type=str(row["assessment_type"] or "legacy_import"),
            )
            answers = list(_coerce_json_value(row["answers"]) or [])
            snapshots = list(_coerce_json_value(row["snapshots"]) or [])
            snapshots_by_item = {
                str(snapshot.get("assessment_item_id") or "").strip(): snapshot
                for snapshot in snapshots
                if isinstance(snapshot, dict) and str(snapshot.get("assessment_item_id") or "").strip()
            }

            right_count = int(row["score_correct"] or 0)
            total_items = int(row["score_total"] or 0)
            attempt = ActivityAttempt(
                user_id=row["user_id"],
                module_id=row["module_id"],
                module_activity_id=activity.id,
                activity_key=activity.activity_key,
                activity_title=activity.title,
                activity_type=activity.activity_type,
                right_count=right_count,
                wrong_count=max(total_items - right_count, 0),
                total_items=total_items,
                score_percent=float(row["score_percent"] or 0),
                improvement_areas=[],
                ai_metadata={"legacy_snapshot_count": len(snapshots)},
                source="legacy_import",
                notes=note_token,
                submitted_at=_coerce_datetime_value(row["submitted_at"]) or utc_now(),
            )
            db.add(attempt)
            db.flush()

            for index, answer in enumerate(answers, start=1):
                if not isinstance(answer, dict):
                    continue
                item_key = str(answer.get("assessment_item_id") or f"legacy-item-{index}").strip()
                snapshot = snapshots_by_item.get(item_key)
                item_ai_metadata = {}
                if snapshot:
                    item_ai_metadata = {
                        key: value for key, value in snapshot.items() if key != "assessment_item_id"
                    }
                db.add(
                    ActivityAttemptItem(
                        attempt_id=attempt.id,
                        item_key=item_key,
                        prompt=answer.get("prompt"),
                        expected_answer=answer.get("expected_response"),
                        student_answer=answer.get("response_text"),
                        is_correct=answer.get("is_correct"),
                        confidence=answer.get("confidence"),
                        ai_metadata=item_ai_metadata,
                    )
                )

            detailed_import_keys.add((row["user_id"], row["module_id"], str(row["assessment_id"])))

        db.commit()

    report_rows = (
        db.query(AssessmentReport)
        .order_by(AssessmentReport.created_at.asc(), AssessmentReport.id.asc())
        .all()
    )
    for report in report_rows:
        report_key = (report.user_id, report.module_id, report.assessment_id)
        if report_key in detailed_import_keys:
            continue

        note_token = f"legacy_report_id={report.id}"
        if (
            db.query(ActivityAttempt)
            .filter(ActivityAttempt.source == "legacy_report_import", ActivityAttempt.notes == note_token)
            .first()
        ):
            continue

        activity = _ensure_module_activity(
            db,
            module_id=report.module_id,
            activity_key=report.assessment_id,
            activity_title=report.assessment_title,
            activity_type="legacy_report",
        )
        db.add(
            ActivityAttempt(
                user_id=report.user_id,
                module_id=report.module_id,
                module_activity_id=activity.id,
                activity_key=activity.activity_key,
                activity_title=activity.title,
                activity_type=activity.activity_type,
                right_count=report.right_count,
                wrong_count=report.wrong_count,
                total_items=report.total_items,
                score_percent=report.score_percent,
                improvement_areas=list(report.improvement_areas or []),
                ai_metadata={},
                source="legacy_report_import",
                notes=note_token,
                submitted_at=report.created_at,
            )
        )

    db.commit()


def validate_seed_data() -> None:
    published_slugs = {item["slug"] for item in SEED_MODULES if item.get("is_published", True)}
    for item in SEED_MODULES:
        if item.get("is_published", True) and not item.get("lessons"):
            raise RuntimeError(f"Published module '{item['slug']}' is missing lessons.")


def ensure_schema_updates() -> None:
    published_slugs = {item["slug"] for item in SEED_MODULES if item.get("is_published", True)}

    # Users table profile/account lifecycle columns.
    _add_column_if_missing("users", "first_name", "ALTER TABLE users ADD COLUMN first_name VARCHAR(120)")
    _add_column_if_missing("users", "middle_name", "ALTER TABLE users ADD COLUMN middle_name VARCHAR(120)")
    _add_column_if_missing("users", "last_name", "ALTER TABLE users ADD COLUMN last_name VARCHAR(120)")
    _add_column_if_missing(
        "users", "company_name", "ALTER TABLE users ADD COLUMN company_name VARCHAR(200)"
    )
    _add_column_if_missing("users", "email", "ALTER TABLE users ADD COLUMN email VARCHAR(255)")
    _add_column_if_missing(
        "users", "phone_number", "ALTER TABLE users ADD COLUMN phone_number VARCHAR(40)"
    )
    _add_column_if_missing("users", "address", "ALTER TABLE users ADD COLUMN address TEXT")
    _add_column_if_missing("users", "birth_date", "ALTER TABLE users ADD COLUMN birth_date DATE")
    _add_column_if_missing(
        "users", "profile_image_path", "ALTER TABLE users ADD COLUMN profile_image_path VARCHAR(500)"
    )
    _add_column_if_missing(
        "users",
        "must_change_password",
        "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _add_column_if_missing(
        "users",
        "role",
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'",
    )
    _add_column_if_missing(
        "users",
        "archived_at",
        "ALTER TABLE users ADD COLUMN archived_at TIMESTAMP",
    )
    _add_column_if_missing(
        "enrollments",
        "rejection_reason_code",
        "ALTER TABLE enrollments ADD COLUMN rejection_reason_code VARCHAR(40)",
    )
    _add_column_if_missing(
        "enrollments",
        "rejection_reason_detail",
        "ALTER TABLE enrollments ADD COLUMN rejection_reason_detail TEXT",
    )
    _create_table_if_missing(
        "archived_student_accounts",
        """
        CREATE TABLE archived_student_accounts (
            id INTEGER PRIMARY KEY,
            original_user_id INTEGER NOT NULL UNIQUE,
            original_username VARCHAR(120) NOT NULL,
            original_email VARCHAR(255),
            first_name VARCHAR(120),
            middle_name VARCHAR(120),
            last_name VARCHAR(120),
            company_name VARCHAR(200),
            phone_number VARCHAR(40),
            address TEXT,
            birth_date DATE,
            profile_image_path VARCHAR(500),
            role VARCHAR(20) NOT NULL DEFAULT 'student',
            enrollment_id INTEGER,
            registration_id INTEGER,
            batch_id INTEGER,
            archive_reason VARCHAR(120),
            archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(original_user_id) REFERENCES users(id)
        )
        """,
    )
    _add_column_if_missing(
        "archived_student_accounts",
        "company_name",
        "ALTER TABLE archived_student_accounts ADD COLUMN company_name VARCHAR(200)",
    )
    _add_column_if_missing(
        "archived_student_accounts",
        "company_name",
        "ALTER TABLE archived_student_accounts ADD COLUMN company_name VARCHAR(200)",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_right_count",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_right_count INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_wrong_count",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_wrong_count INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_total_items",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_total_items INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_label",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_label VARCHAR(255)",
    )
    _add_column_if_missing(
        "user_module_progress",
        "completed_assessments",
        "ALTER TABLE user_module_progress ADD COLUMN completed_assessments JSON NOT NULL DEFAULT '[]'",
    )
    _add_column_if_missing(
        "user_module_progress",
        "improvement_areas",
        "ALTER TABLE user_module_progress ADD COLUMN improvement_areas JSON NOT NULL DEFAULT '[]'",
    )
    _add_column_if_missing(
        "user_module_progress",
        "report_sent_at",
        "ALTER TABLE user_module_progress ADD COLUMN report_sent_at TIMESTAMP",
    )
    _add_column_if_missing(
        "section_student_assignments",
        "course_completed_at",
        "ALTER TABLE section_student_assignments ADD COLUMN course_completed_at TIMESTAMP",
    )
    _add_column_if_missing(
        "section_student_assignments",
        "auto_archive_due_at",
        "ALTER TABLE section_student_assignments ADD COLUMN auto_archive_due_at TIMESTAMP",
    )

    missing_activity_blueprints = sorted(
        slug for slug in published_slugs if not MODULE_ACTIVITY_BLUEPRINTS_BY_SLUG.get(slug)
    )
    if missing_activity_blueprints:
        raise RuntimeError(
            "Published modules are missing activity blueprints: "
            + ", ".join(missing_activity_blueprints)
        )


def _verify_required_tables() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    missing_tables = sorted(REQUIRED_TABLES - existing_tables)
    if missing_tables:
        raise RuntimeError(
            "Database schema is missing required tables. "
            "Run Alembic migrations (`alembic upgrade head`) or use SQLite local bootstrap. "
            f"Missing: {', '.join(missing_tables)}"
        )


def init_db() -> None:
    # Import models before create_all so SQLAlchemy registers metadata.
    from app import models  # noqa: F401

    validate_seed_data()
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    if not settings.should_auto_bootstrap_schema:
        _verify_required_tables()

    with SessionLocal() as db:
        seed_demo_user(db)
        seed_admin_user(db)
        backfill_enrollments(db)
        backfill_legacy_activity_attempts(db)
