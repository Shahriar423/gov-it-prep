from bson import ObjectId
from bson.errors import InvalidId


def parse_object_id(value, error_cls, message: str) -> ObjectId:
    """Turn a string id into an ObjectId, or raise error_cls(message)."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise error_cls(message)